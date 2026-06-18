package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

// ── Director:写脚本 → 下发视频 ───────────────────────────────────────────────

// directorSystemFor 按目标市场生成 DIRECTOR system prompt:口播/台词用市场母语,
// videoPrompt 的视觉描述保持英文(Seedance 对英文视觉指令理解最好),脚本/标题仍面向中国卖家用中文。
func directorSystemFor(v voiceSpec) string {
	return fmt.Sprintf(`你是 OneClaw 的"短视频创作 Agent",服务 TikTok Shop 跨境卖家。本条视频的目标市场:%s,口播语言:%s。
根据用户的商品/需求,产出一条可直接生成的带货短视频:分镜、口播、视频提示词三者必须一一对应。

先判断哪种叙事角度最适合该商品,从下面四种里选一个:
- UNBOXING(开箱):有质感、配件多、第一印象强的实物
- COMPARISON(对比):有竞品参照或参数可比的商品
- SCENE(场景):融入生活方式、使用场景出片的商品
- BEFORE_AFTER(效果对比):使用前后有可见变化的商品
不要硬套不合适的角度;分镜必须体现所选角度的叙事结构。
若商品档案含「真实爆款参考」,优先提炼这些已验证卖货视频的开头钩子套路、叙事结构与卖点切入,据此设计本条 hook 与分镜(上面四种角度作为兜底分类);学结构、不照抄原文。

如果用户消息附带「商品档案」,以档案里的真实卖点、价格、市场数据为准:
口播要引用其中的具体信息(如价格、卖点),绝对不要编造数字;提及价格时沿用档案里的美元数字,不要自行换算汇率。
档案里的「真实爆款参考」是同类已成交视频的文案,只用来学钩子与结构;口播仍按目标市场母语地道重写,不要搬运参考里的原话或语言。

规则:
- 视频总时长 4-15 秒,按镜头数合理分配(3 镜头约 9-12 秒),时间轴必须连续且与总时长一致
- 口播是%s(%s观众听的),地道口语化 UGC 语气,短句,每镜头一句;要像母语者随手拍,不要翻译腔
- videoPrompt 是多镜头提示词:视觉描述用英文,逐镜头描述画面/运镜/光线,并把口播台词用引号原文写进对应镜头
  (视频模型支持音画联合生成,会按引号内台词输出配音,所以引号内必须是%s台词),镜头间用自然剪切衔接
- videoPrompt 末尾固定加一句:All spoken dialogue is in %s.

只输出合法 JSON,不要 markdown:
{
  "style": "UNBOXING | COMPARISON | SCENE | BEFORE_AFTER 之一",
  "title": "视频标题(中文,≤20字)",
  "script": "分镜脚本,3-5 个镜头,每镜头一行,格式:镜头N(起-止秒)|画面(中文)|口播原文(%s)",
  "videoPrompt": "Shot 1 (0-3s): visual description, camera move, lighting. VO: \"spoken line in target language.\" Shot 2 (3-7s): ...",
  "durationSec": 12,
  "aspectRatio": "9:16"
}`, v.MarketCN, v.LangCN, v.LangCN, v.MarketCN, v.LangCN, v.Directive, v.LangCN)
}

type directorOut struct {
	Style       string `json:"style"`
	Title       string `json:"title"`
	Script      string `json:"script"`
	VideoPrompt string `json:"videoPrompt"`
	DurationSec int    `json:"durationSec"`
	AspectRatio string `json:"aspectRatio"`
}

var styleLabels = map[string]string{
	model.VideoStyleUnboxing:    "开箱",
	model.VideoStyleComparison:  "对比",
	model.VideoStyleScene:       "场景",
	model.VideoStyleBeforeAfter: "效果对比",
}

// normalizeStyle 把 LLM 输出归一到四个合法风格,非法或为空时回落 SCENE。
func normalizeStyle(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	if _, ok := styleLabels[s]; ok {
		return s
	}
	return model.VideoStyleScene
}

// clampDuration 把用户在「设置」里指定的时长夹进 Seedance 2.0 支持的 4-15s;
// 返回 0 表示「未指定」(交给调用方落 AI 自选/默认值)。
func clampDuration(sec int) int {
	switch {
	case sec <= 0:
		return 0
	case sec < 4:
		return 4
	case sec > 15:
		return 15
	default:
		return sec
	}
}

// normalizeAspect 只放行 9:16 / 16:9 / 1:1;空或非法返回空串,表示「用 AI/默认值」。
func normalizeAspect(ar string) string {
	switch strings.TrimSpace(ar) {
	case "9:16", "16:9", "1:1":
		return strings.TrimSpace(ar)
	default:
		return ""
	}
}

// productFacts 把选品库商品(及关联 EchoTik 市场数据)压成事实块,供 DIRECTOR/LISTING 注入创作上下文;
// 同时返回商品实拍主图 URL(视频首帧 / Listing 出图参考,真货入画)和商品来源市场
// (DiscoverProduct.Region,DIRECTOR 据此定口播语言;手动建的商品无来源市场,region 为空)。
// 商品不存在或不属于该工作台时 ok=false。
func (s *AgentService) productFacts(ctx context.Context, wsID, productID uuid.UUID, withHotVideos bool) (facts, coverURL, region string, hotCount int, ok bool) {
	var p model.Product
	if err := s.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ?", productID, wsID).
		First(&p).Error; err != nil {
		return "", "", "", 0, false
	}
	var b strings.Builder
	fmt.Fprintf(&b, "商品:%s", p.Title)
	if p.Category != "" {
		fmt.Fprintf(&b, "(%s)", p.Category)
	}
	fmt.Fprintf(&b, "\n售价 $%.2f · 毛利 %d%% · ROI 评分 %d", float64(p.PriceCents)/100, p.MarginPct, p.RoiScore)
	if p.MonthlySales > 0 {
		fmt.Fprintf(&b, " · 月销 %d", p.MonthlySales)
	}
	if p.TrendDelta != 0 {
		fmt.Fprintf(&b, " · 销量趋势 %+d%%", p.TrendDelta)
	}
	b.WriteString("\n")
	if p.Note != nil && strings.TrimSpace(*p.Note) != "" {
		fmt.Fprintf(&b, "选品理由:%s\n", *p.Note)
	}
	if p.DiscoverProductID != nil {
		var dp model.DiscoverProduct
		if err := s.db.WithContext(ctx).First(&dp, "id = ?", *p.DiscoverProductID).Error; err == nil {
			fmt.Fprintf(&b, "市场数据(EchoTik %s):佣金 %.1f%% · 总销量 %d · 带货视频 %d 条 · 带货达人 %d 人\n",
				dp.Region, dp.CommissionRate, dp.TotalSaleCnt, dp.TotalVideoCnt, dp.TotalIflCnt)
			region = dp.Region
			if len(dp.CoverUrls) > 0 {
				var urls []string
				if json.Unmarshal(dp.CoverUrls, &urls) == nil && len(urls) > 0 {
					coverURL = strings.TrimSpace(urls[0])
				}
			}
			// 真实爆款参考:该商品/品类已跑出销量的带货视频文案,供 DIRECTOR 逆向钩子与结构。
			// 仅出视频(DIRECTOR)需要;LISTING/TRYON 不触网。best-effort + 限时,EchoTik 慢/失败都不拖累生成。
			if withHotVideos {
				hctx, hcancel := context.WithTimeout(ctx, 6*time.Second)
				hot := s.discover.TopSellingVideos(hctx, dp.ExternalID, dp.Region, dp.CategoryID, 5)
				hcancel()
				if len(hot) > 0 {
					b.WriteString("真实爆款参考(该商品/品类在 TikTok 已跑出销量的带货视频,学钩子与结构、勿抄原文):\n")
					for i, h := range hot {
						fmt.Fprintf(&b, "%d.「%s」— 卖出 %d 件 · $%.0f\n", i+1, firstN(h.Desc, 60), h.SaleCnt, float64(h.GmvCents)/100)
					}
					hotCount = len(hot)
				}
			}
		}
	}
	return b.String(), coverURL, region, hotCount, true
}

// directorContext 一次脚本生成所需的全部已解析素材。
// runDirector(派活)和 RedraftVideoScript(确认卡改市场重写)各自组装后共用 directorGenerate。
type directorContext struct {
	productID     *uuid.UUID
	facts         string // 商品档案事实块,空表示无商品
	firstFrameURL string
	persona       *model.ModelAsset
	region        string // 已归一的目标市场 code(voiceFor 处理过)
	instruction   string // 可选:一句话重写指令(空表示直接换一版)
	durationSec   int    // 用户在「设置」锁的时长(秒);0=AI 自选/默认 12s
	aspectRatio   string // 用户在「设置」锁的比例(9:16/16:9/1:1);空=AI/默认 9:16
	hotVideoCount int    // productFacts 注入的真实爆款参考条数(>0 时在草稿回显)
}

func (s *AgentService) runDirector(ctx context.Context, wsID uuid.UUID, input string, opts AgentCreateOpts) (string, any, llm.Usage, error) {
	dc := directorContext{productID: opts.ProductID}

	// 首帧优先级:用户指定素材 > 商品实拍主图(都没有则 ConfirmVideo 时人设场景照兜底)。
	if opts.MaterialID != nil {
		dc.firstFrameURL = s.materialImageURL(ctx, wsID, *opts.MaterialID)
	}
	prodRegion := ""
	if dc.productID != nil {
		if facts, cover, region, hot, ok := s.productFacts(ctx, wsID, *dc.productID, true); ok {
			dc.facts = facts
			dc.hotVideoCount = hot
			prodRegion = region
			if dc.firstFrameURL == "" {
				dc.firstFrameURL = cover
			}
		} else {
			// 商品查不到就当没传,避免把视频挂到无效商品上
			dc.productID = nil
		}
	}
	// 出镜人设:脚本与口播按这位创作者出镜来写;外观提示词由 ConfirmVideo 统一注入,避免重复描述。
	if opts.PersonaID != nil {
		if _, _, asset := s.personaPrompt(ctx, wsID, *opts.PersonaID); asset != nil {
			dc.persona = asset
		}
	}
	// 目标市场优先级:显式指定 > 商品来源市场 > US;非法值由 voiceFor 静默回退。
	region := strings.TrimSpace(opts.Region)
	if region == "" {
		region = prodRegion
	}
	dc.region, _ = voiceFor(region)
	// 「设置」里锁的时长/比例随派活带入;非法值由 clampDuration/normalizeAspect 静默回退。
	dc.durationSec = opts.DurationSec
	dc.aspectRatio = opts.AspectRatio

	return s.directorGenerate(ctx, wsID, input, dc)
}

// directorGenerate 用已解析的素材跑一次脚本生成,产出任务 output + 草稿 metadata。
func (s *AgentService) directorGenerate(ctx context.Context, wsID uuid.UUID, input string, dc directorContext) (string, map[string]any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请设置 OPENROUTER_API_KEY")
	}
	_, voice := voiceFor(dc.region)
	user := input
	if dc.facts != "" {
		user = fmt.Sprintf("%s\n\n商品档案(选品库真实数据):\n%s", input, dc.facts)
	}
	if dc.firstFrameURL != "" {
		user += "\n注:已指定一张实拍图作为视频首帧,videoPrompt 请以该画面为起点设计运镜,自然展开。"
	}
	if dc.persona != nil {
		tone := ""
		if dc.persona.Style != nil && strings.TrimSpace(*dc.persona.Style) != "" {
			tone = "(" + strings.TrimSpace(*dc.persona.Style) + ")"
		}
		user += fmt.Sprintf(
			"\n出镜人设:%s%s。分镜与口播请按这位真人创作者第一人称出镜设计,口吻贴合人设;不要在 videoPrompt 里描述其外貌,系统出片时会自动注入。",
			dc.persona.Name, tone)
	}
	if ins := strings.TrimSpace(dc.instruction); ins != "" {
		user += fmt.Sprintf("\n\n本次只做局部调整(商品、目标市场、出镜人设保持不变),据此重写脚本与 videoPrompt:%s", ins)
	}
	// 用户在「设置」锁了时长/比例时作为硬约束写进提示,让脚本按这个时长配速、按该画幅构图。
	if d := clampDuration(dc.durationSec); d > 0 {
		user += fmt.Sprintf("\n本条视频时长锁定为 %d 秒,脚本与分镜请严格按这个时长配速,不要超时。", d)
	}
	if ar := normalizeAspect(dc.aspectRatio); ar != "" {
		user += fmt.Sprintf("\n视频画幅锁定为 %s,运镜与构图按此比例设计。", ar)
	}

	res, err := s.llm.Chat(ctx, directorSystemFor(voice), user, true, 2200)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}
	var out directorOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("解析脚本失败: %w", err)
	}
	if strings.TrimSpace(out.VideoPrompt) == "" {
		out.VideoPrompt = input
	}
	// 时长:用户在「设置」显式锁的优先于 AI 自选;都没有时给 12s(够放 3 个镜头)。统一夹 Seedance 2.0 的 4-15s。
	if d := clampDuration(dc.durationSec); d > 0 {
		out.DurationSec = d
	} else {
		switch {
		case out.DurationSec <= 0:
			out.DurationSec = 12
		case out.DurationSec < 4:
			out.DurationSec = 4
		case out.DurationSec > 15:
			out.DurationSec = 15
		}
	}
	// 比例:用户显式锁的优先,否则沿用 AI 值,空则默认竖屏 9:16。
	if ar := normalizeAspect(dc.aspectRatio); ar != "" {
		out.AspectRatio = ar
	} else if out.AspectRatio == "" {
		out.AspectRatio = "9:16"
	}
	title := out.Title
	if title == "" {
		title = firstN(input, 40)
	}
	style := normalizeStyle(out.Style)

	// 只产脚本草稿,不直接下发视频:用户在任务流里确认后才消耗视频生成额度(ConfirmVideo)。
	meta := map[string]any{
		"title": title, "script": out.Script, "style": style,
		"videoPrompt": out.VideoPrompt, "durationSec": out.DurationSec, "aspectRatio": out.AspectRatio,
		"region": dc.region, "voiceLang": voice.LangCN,
		"draft": true,
	}
	if dc.productID != nil {
		meta["productId"] = dc.productID.String()
	}
	if dc.firstFrameURL != "" {
		meta["firstFrameUrl"] = dc.firstFrameURL
	}
	if dc.persona != nil {
		meta["preferredPersonaId"] = dc.persona.ID.String()
		meta["personaName"] = dc.persona.Name
	}
	var b strings.Builder
	fmt.Fprintf(&b, "🎬 %s · 角度:%s\n\n%s\n", title, styleLabels[style], out.Script)
	fmt.Fprintf(&b, "\n🌍 目标市场:%s · 口播:%s(确认卡上可改市场)", voice.MarketCN, voice.LangCN)
	if dc.hotVideoCount > 0 {
		fmt.Fprintf(&b, "\n📈 已参考该商品 %d 条真实带货爆款的钩子套路。", dc.hotVideoCount)
	}
	if dc.firstFrameURL != "" {
		b.WriteString("\n🖼 已取实拍图作为视频首帧,出镜的就是你的真货。")
	}
	if dc.persona != nil {
		fmt.Fprintf(&b, "\n🎤 出镜人设「%s」已就位,确认出片时自动沿用。", dc.persona.Name)
	}
	b.WriteString("\n📝 脚本已就绪。满意就点下方「生成视频」出片;想换方向,直接重新派活描述新要求。")
	return b.String(), meta, res.Usage, nil
}

// materialImageURL 校验素材属于该工作台且为图片,返回其 URL;不合法返回空串(当没传处理)。
func (s *AgentService) materialImageURL(ctx context.Context, wsID, materialID uuid.UUID) string {
	var m model.Material
	if err := s.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ? AND type = ?", materialID, wsID, "IMAGE").
		First(&m).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(m.URL)
}

// directorDraft 是 DIRECTOR 任务 metadata 里的脚本草稿(runDirector 写入,ConfirmVideo 消费)。
type directorDraft struct {
	Title              string `json:"title"`
	Script             string `json:"script"`
	Style              string `json:"style"`
	VideoPrompt        string `json:"videoPrompt"`
	DurationSec        int    `json:"durationSec"`
	AspectRatio        string `json:"aspectRatio"`
	ProductID          string `json:"productId"`
	FirstFrameURL      string `json:"firstFrameUrl"`
	PreferredPersonaID string `json:"preferredPersonaId"` // 派活时预选的人设,ConfirmVideo 未指定时沿用
	Region             string `json:"region"`             // 目标市场 code(决定口播语言;旧任务无此字段视同 US)
	VoiceLang          string `json:"voiceLang"`          // 口播语言中文名(前端展示用)
	VideoID            string `json:"videoId"`
	Draft              bool   `json:"draft"`
}

// RedraftVideoScript 确认卡上改目标市场后,用新市场的母语重写脚本草稿(纯文本 LLM 调用,不计额度):
// 台词语言=配音语言,地道口播不是直译,必须让用户在确认卡看到新台词后再花视频额度。
// 原子条件更新 DONE→RUNNING 防连点;失败时回滚 DONE 保留原脚本(前端按 metadata.region 未变识别失败)。
func (s *AgentService) RedraftVideoScript(ctx context.Context, wsID, taskID uuid.UUID, region string) (*model.AgentTask, error) {
	if _, ok := regionVoices[strings.ToUpper(strings.TrimSpace(region))]; !ok {
		return nil, apperr.BadRequest("目标市场无效")
	}
	return s.regenDraft(ctx, wsID, taskID, region, "")
}

// RewriteVideoScript 确认卡上「一句话重写」:沿用草稿当前市场/商品/人设,按可选指令重生成脚本草稿
// (指令留空 = 直接换一版)。纯文本 LLM 调用,不计额度;出片前可反复改。
func (s *AgentService) RewriteVideoScript(ctx context.Context, wsID, taskID uuid.UUID, instruction string) (*model.AgentTask, error) {
	return s.regenDraft(ctx, wsID, taskID, "", strings.TrimSpace(instruction))
}

// regenDraft 是「换市场」与「一句话重写」共用的重生成流程:校验仍是待确认草稿 → 原子认领
// DONE→RUNNING(防连点)→ 后台重跑脚本生成。region 留空表示沿用草稿当前市场(重写场景)。
func (s *AgentService) regenDraft(ctx context.Context, wsID, taskID uuid.UUID, region, instruction string) (*model.AgentTask, error) {
	var t model.AgentTask
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", taskID, wsID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("任务不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询任务失败", err)
	}
	if t.Agent != model.AgentDirector || t.Status != model.TaskDone {
		return nil, apperr.BadRequest("该任务没有可重写的脚本")
	}
	var d directorDraft
	if len(t.Metadata) > 0 {
		_ = json.Unmarshal(t.Metadata, &d)
	}
	if !d.Draft || d.VideoID != "" {
		return nil, apperr.BadRequest("视频已生成,无法重写脚本;想换方向请重新派活")
	}
	if strings.TrimSpace(region) == "" {
		region = d.Region // 重写沿用草稿当前市场
	}

	// 原子认领:并发/双击时只有一个请求能把 DONE 翻成 RUNNING。
	claim := s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Where("id = ? AND status = ? AND metadata->>'draft' = 'true'", taskID, model.TaskDone).
		Updates(map[string]any{"status": model.TaskRunning, "started_at": time.Now()})
	if claim.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "重写脚本失败", claim.Error)
	}
	if claim.RowsAffected == 0 {
		return nil, apperr.BadRequest("脚本正在重写中,请稍候")
	}

	go s.redraftExecute(taskID, wsID, t.Input, d, region, instruction)
	t.Status = model.TaskRunning
	return &t, nil
}

// redraftExecute 后台重跑脚本生成。已知边界:中途服务重启时 RecoverStartup 会把 RUNNING 翻 FAILED,
// 用户需重新派活(与普通任务一致)。注意失败不走 fail():那会退还原派活的 UsageAgentTask 额度。
func (s *AgentService) redraftExecute(taskID, wsID uuid.UUID, input string, d directorDraft, region, instruction string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	restore := func(reason string) {
		logger.Warn("[agent] 重写脚本失败,已保留原脚本",
			logger.String("task", taskID.String()), logger.String("err", reason))
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Updates(map[string]any{"status": model.TaskDone, "finished_at": time.Now()})
	}
	defer func() {
		if r := recover(); r != nil {
			restore(fmt.Sprintf("panic: %v", r))
		}
	}()

	dc := directorContext{
		firstFrameURL: d.FirstFrameURL,
		instruction:   instruction,
		durationSec:   d.DurationSec, // 改市场/重写时沿用用户原先锁的时长比例,不被 AI 重置
		aspectRatio:   d.AspectRatio,
	}
	dc.region, _ = voiceFor(region)
	if d.ProductID != "" {
		if pid, e := uuid.Parse(d.ProductID); e == nil {
			if facts, _, _, hot, ok := s.productFacts(ctx, wsID, pid, true); ok {
				dc.productID = &pid
				dc.facts = facts
				dc.hotVideoCount = hot
			}
		}
	}
	if d.PreferredPersonaID != "" {
		if pid, e := uuid.Parse(d.PreferredPersonaID); e == nil {
			if _, _, asset := s.personaPrompt(ctx, wsID, pid); asset != nil {
				dc.persona = asset
			}
		}
	}

	output, meta, usage, err := s.directorGenerate(ctx, wsID, input, dc)
	if err != nil {
		restore(err.Error())
		return
	}
	updates := map[string]any{
		"status": model.TaskDone, "output": output, "finished_at": time.Now(),
		"model": usage.Model, "tokens_in": usage.TokensIn, "tokens_out": usage.TokensOut, "cost_cents": usage.CostCents,
	}
	if b, e := json.Marshal(meta); e == nil {
		updates["metadata"] = model.JSONB(b)
	}
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).Updates(updates)
}

// personaPrompt 把人设资产压成视频 prompt 注入段 + 兜底首帧图。
// 预置人设 Description 末行带「外观提示词:<英文 look>」,自有模特退化用 description/style。
func (s *AgentService) personaPrompt(ctx context.Context, wsID, personaID uuid.UUID) (line, refImage string, asset *model.ModelAsset) {
	var m model.ModelAsset
	if err := s.db.WithContext(ctx).
		Where("id = ? AND (workspace_id = ? OR is_preset = TRUE)", personaID, wsID).
		First(&m).Error; err != nil {
		return "", "", nil
	}
	look := ""
	if m.Description != nil {
		desc := *m.Description
		if i := strings.Index(desc, "外观提示词:"); i >= 0 {
			look = strings.TrimSpace(desc[i+len("外观提示词:"):])
		} else {
			look = strings.TrimSpace(desc)
		}
	}
	if look == "" && m.Style != nil {
		look = strings.TrimSpace(*m.Style)
	}
	if look == "" {
		return "", "", nil
	}
	line = fmt.Sprintf(
		"\nOn-camera creator: %s. The exact same person is the presenter in every shot — consistent face, hairstyle and outfit, natural UGC selfie energy.",
		look)
	// 场景照(参考图组第 4 张)最像实拍开场,作无商品图时的首帧兜底;没有就用头像。
	var refs []string
	if len(m.RefImageURLs) > 0 && json.Unmarshal(m.RefImageURLs, &refs) == nil && len(refs) > 0 {
		refImage = refs[len(refs)-1]
	} else if m.AvatarURL != nil {
		refImage = *m.AvatarURL
	}
	return line, refImage, &m
}

// ConfirmVideo 用户确认脚本草稿后才真正下发视频生成。
// personaID 非空时把所选人设(数字人)注入 videoPrompt,保证出镜的是同一张脸。
// 幂等:已生成过则直接返回现有视频;用 jsonb 原子认领 draft 防双击重复出片。
func (s *AgentService) ConfirmVideo(ctx context.Context, wsID, taskID uuid.UUID, personaID *uuid.UUID) (*model.Video, error) {
	var t model.AgentTask
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", taskID, wsID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("任务不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询任务失败", err)
	}
	if t.Agent != model.AgentDirector || t.Status != model.TaskDone {
		return nil, apperr.BadRequest("该任务没有可生成的脚本")
	}
	var d directorDraft
	if len(t.Metadata) > 0 {
		_ = json.Unmarshal(t.Metadata, &d)
	}
	if d.VideoID != "" {
		if vid, e := uuid.Parse(d.VideoID); e == nil {
			if v, e := s.videos.Get(ctx, wsID, vid); e == nil {
				return v, nil
			}
		}
	}
	if !d.Draft || strings.TrimSpace(d.VideoPrompt) == "" {
		return nil, apperr.BadRequest("脚本草稿缺失,请重新派活生成脚本")
	}
	// 确认时没选人设,回落派活阶段预选的(创作页 composer 选过就不必再选一遍)。
	if personaID == nil && d.PreferredPersonaID != "" {
		if pid, e := uuid.Parse(d.PreferredPersonaID); e == nil {
			personaID = &pid
		}
	}

	// 原子认领草稿:并发/双击时只有一个请求能翻掉 draft 标记。
	claim := s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Where("id = ? AND metadata->>'draft' = 'true'", taskID).
		Update("metadata", gorm.Expr(`metadata || '{"draft":false}'::jsonb`))
	if claim.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "确认失败", claim.Error)
	}
	if claim.RowsAffected == 0 {
		return nil, apperr.BadRequest("视频已在生成中,请稍候刷新")
	}
	restoreDraft := func() {
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Update("metadata", gorm.Expr(`metadata || '{"draft":true}'::jsonb`))
	}

	vi := VideoInput{
		Title: d.Title, Prompt: d.VideoPrompt, Style: normalizeStyle(d.Style),
		DurationSec: d.DurationSec, AspectRatio: d.AspectRatio,
		FirstFrameURL: d.FirstFrameURL,
	}
	if d.ProductID != "" {
		vi.ProductID = &d.ProductID
	}
	var persona *model.ModelAsset
	if personaID != nil {
		if line, ref, asset := s.personaPrompt(ctx, wsID, *personaID); asset != nil {
			vi.Prompt += line
			vi.ModelAssetID = &asset.ID
			// 商品实拍图优先级更高(真货入画);没有商品图时用人设场景照锚定脸。
			if vi.FirstFrameURL == "" && ref != "" {
				vi.FirstFrameURL = ref
			}
			persona = asset
		}
	}
	v, err := s.videos.Create(ctx, wsID, vi)
	if err != nil {
		restoreDraft() // 没花出去钱,把草稿还给用户重试
		return nil, err
	}
	s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", v.ID).Update("script", d.Script)
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
		Update("metadata", gorm.Expr(`metadata || ?::jsonb`, fmt.Sprintf(`{"videoId":%q}`, v.ID.String())))
	if persona != nil {
		s.db.WithContext(ctx).Model(&model.ModelAsset{}).Where("id = ?", persona.ID).
			Update("usage_count", gorm.Expr("usage_count + 1"))
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Update("metadata", gorm.Expr(`metadata || ?::jsonb`,
				fmt.Sprintf(`{"personaId":%q,"personaName":%q}`, persona.ID.String(), persona.Name)))
	}

	// 封面:有商品实拍图(即首帧)直接用,和成片首帧一致还省一次生图;否则 fal flux 兜底。
	if d.FirstFrameURL != "" {
		s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", v.ID).
			Update("thumbnail_url", d.FirstFrameURL)
	} else {
		vid, prompt, ar := v.ID, d.VideoPrompt, d.AspectRatio
		go func() {
			cctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			s.videos.GenerateCover(cctx, vid, prompt, ar)
		}()
	}
	return v, nil
}
