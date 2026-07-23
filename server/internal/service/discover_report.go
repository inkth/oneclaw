package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/llm"
)

// ── 选品官每日报告 ───────────────────────────────────────────────────────────
//
// 报告按 (dt, region, category) 全局共享:内容只由市场数据决定、与用户无关,
// 同组合当天只生成一次,所有用户共读 —— LLM 成本约束在「组合数/天」而非「用户数/天」。
// 数据全部来自本地 DB(动量榜/近7天窗口列/热门视频),生成过程零 EchoTik 调用;
// 底层行由 DiscoverSync 保鲜。externalId 强校验防幻觉,报告里的商品必须真实存在。

const (
	reportStatusRunning = "RUNNING"
	reportStatusDone    = "DONE"
	reportStatusFailed  = "FAILED"

	// reportStaleRunning RUNNING 超过该时长视为生成进程已死(重启/超时),允许接管重生成。
	reportStaleRunning = 5 * time.Minute
	// reportOppMin 报告至少要有的有效机会数,低于即判 FAILED(数据不足以支撑结论)。
	reportOppMin = 1
)

const discoverReportSystem = `你是「发现猫」的选品官,一个替中国跨境电商新手每天盯 TikTok Shop 数据的选品 Agent。
下面给你的是指定市场(可能还限定了类目)的真实数据:近 7 天动量榜、上升黑马榜与热门带货视频,全部来自 EchoTik。

请写一份当日选品报告,输出严格 JSON:
{
  "summary": "两三句的当日总评:这个市场/类目今天值得注意什么。写给新手看,大白话,可点名具体商品与数字",
  "opportunities": [
    {
      "externalId": "必须原样引用数据里的 id,绝不能编造",
      "headline": "12 字以内的机会点,例:低客单冲量款、高佣蓝海",
      "reason": "40 字以内,引用给定数据里的具体数字说明为什么值得做",
      "action": "30 字以内的下一步建议,例:先拍开箱视频小规模测试",
      "tag": "热卖 | 黑马 | 高佣 | 蓝海 之一"
    }
  ],
  "watchouts": ["1-3 条风险或提醒,每条 40 字以内,如同质化、季节性、价格战信号"],
  "videoInsight": "一句话总结热门带货视频的内容套路(没给视频数据时输出空字符串)"
}

强制要求:
- opportunities 选 4-6 个,externalId 必须来自给定数据,优先动量强(近 7 天销量/加速比高)且佣金、价格适合新手的
- 所有数字必须出自给定数据,不要编造销量/佣金/价格;数据没给的维度不要提
- 中文,面向新手,少术语;结论明确,不写"仅供参考"式废话
- 只输出 JSON,不要 markdown 包裹,不要解释文字`

// ReportOpportunity 报告里的一条机会(结构化,externalId 已过防幻觉校验)。
type ReportOpportunity struct {
	ExternalID string `json:"externalId"`
	Headline   string `json:"headline"`
	Reason     string `json:"reason"`
	Action     string `json:"action"`
	Tag        string `json:"tag"`
}

// ReportSections 报告结构化正文(存 sections jsonb)。
type ReportSections struct {
	Opportunities []ReportOpportunity `json:"opportunities"`
	Watchouts     []string            `json:"watchouts"`
	VideoInsight  string              `json:"videoInsight"`
}

// DailyReportView 读路径返回:报告本体 + 机会商品卡水合。
// Generating=true 表示当日报告还在生成(返回的可能是最近一期旧报告或空壳),前端应轮询。
type DailyReportView struct {
	Status     string                      `json:"status"` // DONE | GENERATING | FAILED | EMPTY
	Dt         string                      `json:"dt"`
	Region     string                      `json:"region"`
	CategoryID string                      `json:"categoryId"`
	Generating bool                        `json:"generating"`
	UpdatedAt  *time.Time                  `json:"updatedAt,omitempty"`
	Summary    string                      `json:"summary"`
	Sections   *ReportSections             `json:"sections,omitempty"`
	Products   map[string]DecoratedProduct `json:"products,omitempty"` // externalId → 商品卡
}

func reportDt(now time.Time) string { return now.Format("2006-01-02") }

// GetDailyReport 取当日报告;当日未生成则触发异步生成,先返回最近一期 DONE 报告(带 generating 标记)
// 或生成中空壳。wsID 仅用于商品卡个性化水合(游客传 uuid.Nil)。
func (s *DiscoverService) GetDailyReport(ctx context.Context, wsID uuid.UUID, region, categoryID string) (*DailyReportView, error) {
	if s.db == nil {
		return &DailyReportView{Status: "EMPTY", Region: region, CategoryID: categoryID}, nil
	}
	region = strings.ToUpper(strings.TrimSpace(region))
	if region == "" {
		region = "US"
	}
	categoryID = strings.TrimSpace(categoryID)
	today := reportDt(time.Now())

	var cur model.DiscoverReport
	err := s.db.WithContext(ctx).
		Where("provider = ? AND dt = ? AND region = ? AND category_id = ?", providerEchoTik, today, region, categoryID).
		First(&cur).Error
	switch {
	case err == nil && cur.Status == reportStatusDone:
		return s.hydrateReport(ctx, wsID, &cur, false), nil
	case err == nil && cur.Status == reportStatusRunning:
		if time.Since(cur.UpdatedAt) > reportStaleRunning {
			// 生成进程大概率已死(重启/panic):接管重跑。条件更新保证并发下只有一个接管者。
			res := s.db.WithContext(ctx).Model(&model.DiscoverReport{}).
				Where("id = ? AND status = ? AND updated_at < ?", cur.ID, reportStatusRunning, time.Now().Add(-reportStaleRunning)).
				Update("updated_at", time.Now())
			if res.Error == nil && res.RowsAffected == 1 {
				s.generateReportAsync(ctx, cur.ID, region, categoryID)
			}
		}
		return s.latestOrShell(ctx, wsID, region, categoryID, today), nil
	case err == nil: // FAILED:当天不自动无限重试,读路径触发一次条件重跑(把 FAILED 翻回 RUNNING 的只有一个赢家)。
		res := s.db.WithContext(ctx).Model(&model.DiscoverReport{}).
			Where("id = ? AND status = ?", cur.ID, reportStatusFailed).
			Updates(map[string]any{"status": reportStatusRunning, "error_msg": ""})
		if res.Error == nil && res.RowsAffected == 1 {
			s.generateReportAsync(ctx, cur.ID, region, categoryID)
		}
		return s.latestOrShell(ctx, wsID, region, categoryID, today), nil
	}

	// 当日无记录:抢占式插入 RUNNING 行,插入成功者负责生成;冲突则说明别人已在生成。
	rep := model.DiscoverReport{
		Provider: providerEchoTik, Dt: today, Region: region, CategoryID: categoryID,
		Status: reportStatusRunning,
	}
	res := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&rep)
	if res.Error == nil && res.RowsAffected == 1 {
		s.generateReportAsync(ctx, rep.ID, region, categoryID)
	}
	return s.latestOrShell(ctx, wsID, region, categoryID, today), nil
}

// latestOrShell 当日报告未就绪时:回落最近一期 DONE 报告(带 generating 标记),没有则返回生成中空壳。
func (s *DiscoverService) latestOrShell(ctx context.Context, wsID uuid.UUID, region, categoryID, today string) *DailyReportView {
	var prev model.DiscoverReport
	err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND category_id = ? AND status = ?", providerEchoTik, region, categoryID, reportStatusDone).
		Order("dt DESC").First(&prev).Error
	if err == nil {
		return s.hydrateReport(ctx, wsID, &prev, true)
	}
	return &DailyReportView{Status: "GENERATING", Dt: today, Region: region, CategoryID: categoryID, Generating: true}
}

// hydrateReport 报告 → 视图:解 sections + 机会商品卡水合(个性化浮层随 wsID)。
func (s *DiscoverService) hydrateReport(ctx context.Context, wsID uuid.UUID, rep *model.DiscoverReport, generating bool) *DailyReportView {
	v := &DailyReportView{
		Status: rep.Status, Dt: rep.Dt, Region: rep.Region, CategoryID: rep.CategoryID,
		Generating: generating, Summary: rep.Summary,
	}
	t := rep.UpdatedAt
	v.UpdatedAt = &t
	if len(rep.Sections) > 0 {
		var sec ReportSections
		if json.Unmarshal([]byte(rep.Sections), &sec) == nil {
			v.Sections = &sec
		}
	}
	if v.Sections == nil || len(v.Sections.Opportunities) == 0 {
		return v
	}
	ids := make([]string, 0, len(v.Sections.Opportunities))
	for _, o := range v.Sections.Opportunities {
		ids = append(ids, o.ExternalID)
	}
	var dps []model.DiscoverProduct
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, rep.Region, ids).
		Find(&dps).Error; err == nil && len(dps) > 0 {
		v.Products = make(map[string]DecoratedProduct, len(dps))
		for _, d := range s.decorate(ctx, wsID, dps) {
			v.Products[d.ProductID] = d
		}
	}
	return v
}

// generateReportAsync 后台生成(调用方已通过抢占持有该行)。
func (s *DiscoverService) generateReportAsync(ctx context.Context, repID uuid.UUID, region, categoryID string) {
	goRefresh(ctx, "discover-report", func(bg context.Context) {
		s.generateReport(bg, repID, region, categoryID)
	})
}

// reportProductFacts 商品行事实块:中文名优先,带近 7 天动量与累计口径。
func reportProductFacts(label string, dps []DecoratedProduct) string {
	if len(dps) == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "【%s】\n", label)
	for i, d := range dps {
		name := d.NameZh
		if name == "" {
			name = d.Name
		}
		fmt.Fprintf(&b, "#%d id=%s | %s | 均价$%.2f | 佣金%.1f%% | 近7天销量%d | 近7天GMV$%.0f | 累计销量%d | 带货达人%d | 挂车视频%d\n",
			i+1, d.ProductID, name,
			float64(d.AvgPriceCents)/100, d.CommissionRate,
			d.Sale7dCnt, float64(d.Gmv7dCents)/100,
			d.TotalSaleCnt, d.TotalIflCnt, d.TotalVideoCnt)
	}
	return b.String()
}

// reportVideoFacts 热门带货视频事实块(区域级,不按类目筛:视频类目是文本标签,口径与商品树不一致)。
func (s *DiscoverService) reportVideoFacts(ctx context.Context, region string) string {
	var vids []model.DiscoverVideo
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND sale_cnt > 0", providerEchoTik, region).
		Order("sale_cnt DESC").Limit(6).
		Find(&vids).Error; err != nil || len(vids) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("【近期热门带货视频(全类目)】\n")
	for i, v := range vids {
		desc := v.DescZh
		if desc == "" {
			desc = v.Desc
		}
		if r := []rune(desc); len(r) > 60 {
			desc = string(r[:60]) + "…"
		}
		fmt.Fprintf(&b, "#%d 文案:%s | 类目:%s | 播放%d | 带货件数%d\n", i+1, desc, v.Category, v.Views, v.SaleCnt)
	}
	return b.String()
}

// reportCandidates 组装报告数据源。返回事实块文本 + 可引用商品全集(externalId → 卡)。
// 动量榜为空(冷启动/小类目没有 7 天窗口数据)时回落累计销量榜,保证有数可写。
func (s *DiscoverService) reportCandidates(ctx context.Context, region, categoryID string) (string, map[string]DecoratedProduct) {
	cat := CategoryFilter{L1: categoryID}
	valid := map[string]DecoratedProduct{}
	collect := func(res *RanklistResult) []DecoratedProduct {
		if res == nil {
			return nil
		}
		for _, d := range res.Products {
			valid[d.ProductID] = d
		}
		return res.Products
	}

	hot := collect(s.RisingProducts(ctx, uuid.Nil, region, cat, "hot7d", 15))
	accel := collect(s.RisingProducts(ctx, uuid.Nil, region, cat, "accel", 10))

	var sections []string
	if sec := reportProductFacts("近 7 天动量榜(销量增速最快)", hot); sec != "" {
		sections = append(sections, sec)
	}
	if sec := reportProductFacts("上升黑马榜(基数小但近 7 天爆发)", accel); sec != "" {
		sections = append(sections, sec)
	}

	// 冷启动回落:没有任何 7 天窗口数据时,用近 72h 抓取过的累计热销行托底。
	if len(valid) == 0 {
		q := s.db.WithContext(ctx).
			Where("provider = ? AND region = ? AND last_fetched_at > ?", providerEchoTik, region, time.Now().Add(-72*time.Hour))
		if categoryID != "" {
			q = q.Where("category_id = ?", categoryID)
		}
		var dps []model.DiscoverProduct
		if err := q.Order("total_sale_cnt DESC").Limit(15).Find(&dps).Error; err == nil && len(dps) > 0 {
			fallback := s.decorate(ctx, uuid.Nil, dps)
			if sec := reportProductFacts("热销榜(累计口径,近 7 天窗口数据暂缺)", collectSlice(valid, fallback)); sec != "" {
				sections = append(sections, sec)
			}
		}
	}
	if len(sections) == 0 {
		return "", nil
	}
	if vf := s.reportVideoFacts(ctx, region); vf != "" {
		sections = append(sections, vf)
	}
	return strings.Join(sections, "\n"), valid
}

// collectSlice 把 fallback 行并进可引用全集并原样返回(帮助 reportCandidates 复用校验集)。
func collectSlice(valid map[string]DecoratedProduct, dps []DecoratedProduct) []DecoratedProduct {
	for _, d := range dps {
		valid[d.ProductID] = d
	}
	return dps
}

type reportLLMOut struct {
	Summary       string              `json:"summary"`
	Opportunities []ReportOpportunity `json:"opportunities"`
	Watchouts     []string            `json:"watchouts"`
	VideoInsight  string              `json:"videoInsight"`
}

// generateReport 同步生成并落库(在 goRefresh 的后台 context 里跑)。
func (s *DiscoverService) generateReport(ctx context.Context, repID uuid.UUID, region, categoryID string) {
	finishFail := func(msg string) {
		s.db.WithContext(ctx).Model(&model.DiscoverReport{}).Where("id = ?", repID).
			Updates(map[string]any{"status": reportStatusFailed, "error_msg": msg})
		logger.Warn("[report] 选品报告生成失败",
			logger.String("region", region), logger.String("cat", categoryID), logger.String("err", msg))
	}
	if s.llm == nil || !s.llm.Configured() {
		finishFail("AI 未配置")
		return
	}

	facts, valid := s.reportCandidates(ctx, region, categoryID)
	if facts == "" {
		finishFail("本地暂无该市场/类目的榜单数据")
		return
	}

	catLabel := "全类目"
	if categoryID != "" {
		catLabel = categoryID
		for _, c := range s.Categories(ctx, region) {
			if c.ID == categoryID {
				catLabel = c.Name
				break
			}
		}
	}
	user := fmt.Sprintf("市场:%s\n类目:%s\n日期:%s\n\n%s", region, catLabel, reportDt(time.Now()), facts)

	res, err := s.llm.Chat(ctx, discoverReportSystem, user, true, 2500)
	if err != nil {
		finishFail(err.Error())
		return
	}
	var out reportLLMOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		finishFail("解析模型输出失败: " + err.Error())
		return
	}
	// 防幻觉:externalId 必须在候选全集内,失配即丢弃。
	kept := make([]ReportOpportunity, 0, len(out.Opportunities))
	for _, o := range out.Opportunities {
		o.ExternalID = strings.TrimSpace(o.ExternalID)
		if _, ok := valid[o.ExternalID]; !ok {
			logger.Warn("[report] 丢弃榜单外 externalId", logger.String("id", o.ExternalID))
			continue
		}
		kept = append(kept, o)
	}
	if len(kept) < reportOppMin || strings.TrimSpace(out.Summary) == "" {
		finishFail("模型未给出有效机会清单")
		return
	}

	secBytes, _ := json.Marshal(ReportSections{
		Opportunities: kept, Watchouts: out.Watchouts, VideoInsight: strings.TrimSpace(out.VideoInsight),
	})
	s.db.WithContext(ctx).Model(&model.DiscoverReport{}).Where("id = ?", repID).Updates(map[string]any{
		"status": reportStatusDone, "summary": strings.TrimSpace(out.Summary),
		"sections": model.JSONB(secBytes), "error_msg": "",
		"model": res.Usage.Model, "tokens_in": res.Usage.TokensIn, "tokens_out": res.Usage.TokensOut, "cost_cents": res.Usage.CostCents,
	})
	logger.Info("[report] 选品报告已生成",
		logger.String("region", region), logger.String("cat", categoryID), logger.Int("opportunities", len(kept)))
}

// PrewarmDailyReport 定时预热入口(DiscoverSync 每日调用):确保 (今日, region, 全类目) 报告存在。
// 复用 GetDailyReport 的抢占逻辑;wsID=Nil 不水合个性化。
func (s *DiscoverService) PrewarmDailyReport(ctx context.Context, region string) {
	if _, err := s.GetDailyReport(ctx, uuid.Nil, region, ""); err != nil {
		logger.Warn("[report] 报告预热失败", logger.String("region", region), logger.Err(err))
	}
}

// reportContextForScout 给选品官对话注入的当日上下文:报告正文 + 机会清单(压缩文本)。
// 报告未就绪时返回空串,调用方自行降级为纯榜单事实。
func (s *DiscoverService) reportContextForScout(ctx context.Context, region, categoryID string) string {
	var rep model.DiscoverReport
	err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND category_id = ? AND status = ?", providerEchoTik, region, categoryID, reportStatusDone).
		Order("dt DESC").First(&rep).Error
	if err != nil {
		return ""
	}
	var sec ReportSections
	_ = json.Unmarshal([]byte(rep.Sections), &sec)
	var b strings.Builder
	fmt.Fprintf(&b, "【%s 选品官日报(%s)】\n总评:%s\n", rep.Dt, rep.Region, rep.Summary)
	for i, o := range sec.Opportunities {
		fmt.Fprintf(&b, "机会#%d id=%s [%s] %s — %s;建议:%s\n", i+1, o.ExternalID, o.Tag, o.Headline, o.Reason, o.Action)
	}
	if len(sec.Watchouts) > 0 {
		fmt.Fprintf(&b, "提醒:%s\n", strings.Join(sec.Watchouts, ";"))
	}
	return b.String()
}
