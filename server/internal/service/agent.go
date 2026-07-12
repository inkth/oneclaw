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

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
	"github.com/faxianmao/server/internal/service/fal"
	"github.com/faxianmao/server/internal/service/llm"
	"github.com/faxianmao/server/internal/storage"
)

// AgentService 派发并异步执行 Agent 任务(QUEUED→RUNNING→DONE/FAILED)。
type AgentService struct {
	db       *gorm.DB
	llm      *llm.Client
	videos   *VideoService    // director 用来下发视频
	discover *DiscoverService // analyst 用来取真实榜单候选
	fal      *fal.Client      // listing 用来出主图
	storage  *storage.Storage // listing 主图传 COS
	quota    *QuotaService    // 派活/出图前扣减月度配额
}

func NewAgentService(db *gorm.DB, l *llm.Client, videos *VideoService, discover *DiscoverService, f *fal.Client, st *storage.Storage, q *QuotaService) *AgentService {
	return &AgentService{db: db, llm: l, videos: videos, discover: discover, fal: f, storage: st, quota: q}
}

var validAgents = map[string]bool{
	model.AgentAdvisor:       true,
	model.AgentAnalyst:       true,
	model.AgentDirector:      true,
	model.AgentListing:       true,
	model.AgentTryOn:         true,
	model.AgentVideoAnalysis: true,
}

// AgentCreateOpts 派活时的可选关联资产,创作类 Agent 按需消费。
type AgentCreateOpts struct {
	ConversationID *uuid.UUID // 归属会话:命中则追加进该会话,空/越权则新建一条
	ProductID      *uuid.UUID // 选品库商品:注入真实数据,产出关联到该商品
	PersonaID      *uuid.UUID // 出镜人设(DIRECTOR):脚本贴合人设,确认出片时默认沿用
	MaterialID     *uuid.UUID // 素材库图片:视频首帧(优先于商品主图)/ Listing 出图参考(兜底)
	Region         string     // 目标市场(DIRECTOR):定口播语言;空则跟随商品来源市场,兜底 US
	DurationSec    int        // 视频时长秒(DIRECTOR):用户在「设置」显式锁的优先于 AI 自选,夹 4-15s;0=AI 自定
	AspectRatio    string     // 画幅比例(DIRECTOR):9:16/16:9/1:1;空=默认 9:16
	AutoImages     bool       // 批量 Listing:文案落库后自动接力出图,无需用户二次确认(单图链路恒 false)
}

// Create 建 QUEUED 任务并起 goroutine 异步执行,立即返回任务。
func (s *AgentService) Create(ctx context.Context, wsID uuid.UUID, agent, input string, opts AgentCreateOpts) (*model.AgentTask, error) {
	agent = strings.ToUpper(strings.TrimSpace(agent))
	if !validAgents[agent] {
		return nil, apperr.BadRequest("未知的 agent 类型")
	}
	if strings.TrimSpace(input) == "" {
		return nil, apperr.BadRequest("input 不能为空")
	}
	t := model.AgentTask{ID: uuid.New(), WorkspaceID: wsID, Agent: agent, Status: model.TaskQueued, Input: input}
	// 配额前置:超额直接拒绝;任务终态失败时 fail() 会退回这笔额度。
	if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageAgentTask, 1, &t.ID); err != nil {
		return nil, err
	}
	// 归属会话:命中传入 ID 则追加并置顶,否则按首句新建。配额已过、建会话失败要退回额度,避免白扣。
	cid, err := s.ensureConversation(ctx, wsID, opts.ConversationID, input, agent)
	if err != nil {
		s.quota.Refund(ctx, t.ID, model.UsageAgentTask)
		return nil, apperr.Wrap(apperr.CodeInternal, "创建会话失败", err)
	}
	t.ConversationID = cid
	// 关联商品的任务:派活时就把 productId 写进 metadata。否则 productId 要等任务完成
	// (runListing 返回 meta)才落库,商品卡在 QUEUED/RUNNING 阶段按 productId 查不到状态,
	// 既不显示「生成中」也不启动轮询,看起来像没在做。完成时 execute 会用完整 meta 覆盖。
	if opts.ProductID != nil {
		if b, e := json.Marshal(map[string]string{"productId": opts.ProductID.String()}); e == nil {
			t.Metadata = model.JSONB(b)
		}
	}
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		s.quota.Refund(ctx, t.ID, model.UsageAgentTask)
		return nil, apperr.Wrap(apperr.CodeInternal, "创建任务失败", err)
	}
	// 异步执行:独立 context(请求结束不取消),沿用 service 的 db/llm。
	go s.execute(t.ID, wsID, agent, input, opts)
	return &t, nil
}

func (s *AgentService) List(ctx context.Context, wsID uuid.UUID) ([]model.AgentTask, error) {
	var items []model.AgentTask
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("created_at DESC").
		Limit(50).
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询任务失败", err)
	}
	return items, nil
}

func (s *AgentService) Get(ctx context.Context, wsID, taskID uuid.UUID) (*model.AgentTask, error) {
	var t model.AgentTask
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", taskID, wsID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("任务不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询任务失败", err)
	}
	return &t, nil
}

// execute 后台执行单个任务。任何 panic/错误都落库为 FAILED。
func (s *AgentService) execute(taskID, wsID uuid.UUID, agent, input string, opts AgentCreateOpts) {
	// 视频解析要下载视频 + ffmpeg 抽音轨 + 多模态转录,比纯文本派活慢,放宽超时。
	timeout := 2 * time.Minute
	if agent == model.AgentVideoAnalysis {
		timeout = 5 * time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			s.fail(ctx, taskID, fmt.Sprintf("panic: %v", r))
		}
	}()

	now := time.Now()
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
		Updates(map[string]any{"status": model.TaskRunning, "started_at": now})

	var (
		output string
		meta   any
		usage  llm.Usage
		err    error
	)
	switch agent {
	case model.AgentAdvisor:
		output, meta, usage, err = s.runAdvisor(ctx, taskID, input)
	case model.AgentAnalyst:
		output, meta, usage, err = s.runAnalyst(ctx, wsID, input)
	case model.AgentDirector:
		output, meta, usage, err = s.runDirector(ctx, wsID, input, opts)
	case model.AgentListing:
		output, meta, usage, err = s.runListing(ctx, wsID, input, opts)
	case model.AgentTryOn:
		output, meta, usage, err = s.runTryOn(ctx, taskID, wsID, opts)
	case model.AgentVideoAnalysis:
		output, meta, usage, err = s.runVideoAnalysis(ctx, wsID, input, opts)
	default:
		err = fmt.Errorf("agent %s 尚未在 Go 端实现", agent)
	}
	if err != nil {
		s.fail(ctx, taskID, err.Error())
		return
	}

	updates := map[string]any{
		"status": model.TaskDone, "output": output, "finished_at": time.Now(),
		"model": usage.Model, "tokens_in": usage.TokensIn, "tokens_out": usage.TokensOut, "cost_cents": usage.CostCents,
	}
	if meta != nil {
		if b, e := json.Marshal(meta); e == nil {
			updates["metadata"] = model.JSONB(b)
		}
	}
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).Updates(updates)

	// 批量「文案+出图一起」:文案落库后自动接力出图,无需用户回任务流二次点「生成主图」。
	// 复用 GenerateListingImages 的原子认领 + 出图扣费/退款 + 主图回写;失败(如出图额度不足)
	// 只记日志不影响已生成的文案 —— 该商品仍拿到 Listing,出图缺省可后续手动补。
	if agent == model.AgentListing && opts.AutoImages {
		if _, ierr := s.GenerateListingImages(ctx, wsID, taskID); ierr != nil {
			logger.Info("[agent] 批量 Listing 自动出图未触发(文案已生成)",
				logger.String("task", taskID.String()), logger.String("reason", ierr.Error()))
		}
	}
}

func (s *AgentService) fail(ctx context.Context, taskID uuid.UUID, msg string) {
	logger.Warn("[agent] 任务失败", logger.String("task", taskID.String()), logger.String("err", msg))
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
		Updates(map[string]any{"status": model.TaskFailed, "error_message": msg, "finished_at": time.Now()})
	s.quota.Refund(ctx, taskID, model.UsageAgentTask) // 失败不烧额度
}

// retryableAgents 可一键重试的任务类型:opts 能从 metadata 完整还原。
// TRYON 不在内 —— 其 metadata 只存解析后的图 URL,丢了 PersonaID/MaterialID,重试必败,
// 这类失败引导用户回素材选择器重派。
var retryableAgents = map[string]bool{
	model.AgentAdvisor:  true,
	model.AgentAnalyst:  true,
	model.AgentDirector: true,
	model.AgentListing:  true,
}

// retryMeta 失败任务 metadata 里可还原派活选项的字段(DIRECTOR/LISTING 写入)。
type retryMeta struct {
	ProductID          string `json:"productId"`
	PreferredPersonaID string `json:"preferredPersonaId"`
	Region             string `json:"region"`
	DurationSec        int    `json:"durationSec"`
	AspectRatio        string `json:"aspectRatio"`
}

// optsFromTask 从任务 metadata 还原 AgentCreateOpts,让重试沿用原商品/市场/人设/时长/比例。
func optsFromTask(t *model.AgentTask) AgentCreateOpts {
	var opts AgentCreateOpts
	if len(t.Metadata) == 0 {
		return opts
	}
	var m retryMeta
	if json.Unmarshal([]byte(t.Metadata), &m) != nil {
		return opts
	}
	if id, err := uuid.Parse(m.ProductID); err == nil {
		opts.ProductID = &id
	}
	if id, err := uuid.Parse(m.PreferredPersonaID); err == nil {
		opts.PersonaID = &id
	}
	opts.Region = m.Region
	opts.DurationSec = m.DurationSec
	opts.AspectRatio = m.AspectRatio
	return opts
}

// Retry 重跑一条失败任务:沿用原 input + 从 metadata 还原的选项,重占一笔额度,
// 重置为 QUEUED 并异步执行(复用 execute)。只有失败、且类型可还原的任务可重试。
func (s *AgentService) Retry(ctx context.Context, wsID, taskID uuid.UUID) (*model.AgentTask, error) {
	t, err := s.Get(ctx, wsID, taskID)
	if err != nil {
		return nil, err
	}
	if t.Status != model.TaskFailed {
		return nil, apperr.BadRequest("只有失败的任务可以重试")
	}
	if !retryableAgents[t.Agent] {
		return nil, apperr.BadRequest("该任务类型不支持一键重试,请重新派活")
	}
	opts := optsFromTask(t)
	// 失败时额度已退回,重试重新占一笔(沿用同一 task ID 作计费键,与视频重试同口径)。
	if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageAgentTask, 1, &t.ID); err != nil {
		return nil, err
	}
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", t.ID).
		Updates(map[string]any{
			"status": model.TaskQueued, "error_message": nil,
			"output": nil, "started_at": nil, "finished_at": nil,
		})
	t.Status = model.TaskQueued
	t.ErrorMessage = nil
	go s.execute(t.ID, wsID, t.Agent, t.Input, opts)
	return t, nil
}

// RecoverStartup 服务重启后清理悬挂任务:QUEUED/RUNNING 的执行 goroutine 已随进程消失,
// 标记 FAILED 并退回额度;出图中断(imagesStatus=RUNNING)同理翻成 FAILED 供重试。
func (s *AgentService) RecoverStartup(ctx context.Context) {
	var stale []model.AgentTask
	if err := s.db.WithContext(ctx).
		Where("status IN ?", []string{model.TaskQueued, model.TaskRunning}).
		Find(&stale).Error; err != nil {
		logger.Warn("[agent] 启动恢复:查询悬挂任务失败", logger.Err(err))
		return
	}
	for _, t := range stale {
		s.fail(ctx, t.ID, "服务重启中断,请重新派活")
	}
	if len(stale) > 0 {
		logger.Info("[agent] 启动恢复:已清理悬挂任务", logger.Int("count", len(stale)))
	}

	// LISTING 与 TRYON 都有「任务 DONE 但出图后台异步」的阶段:进程被打断时任务本身已是
	// DONE(逃过上面的 QUEUED/RUNNING 回收),只能靠 imagesStatus=RUNNING 兜底,故两类都要查。
	var imgStale []model.AgentTask
	if err := s.db.WithContext(ctx).
		Where("agent IN ? AND metadata->>'imagesStatus' = ?",
			[]string{model.AgentListing, model.AgentTryOn}, listingImagesRunning).
		Find(&imgStale).Error; err != nil {
		return
	}
	for _, t := range imgStale {
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", t.ID).
			Update("metadata", gorm.Expr(`metadata || '{"imagesStatus":"FAILED"}'::jsonb`))
		s.quota.Refund(ctx, t.ID, model.UsageImage)
		// 试穿无文字产出,出图中断=整单无价值,派活分一并退(与 runTryOnImage 失败路径口径一致)。
		if t.Agent == model.AgentTryOn {
			s.quota.Refund(ctx, t.ID, model.UsageAgentTask)
		}
	}
	if len(imgStale) > 0 {
		logger.Info("[agent] 启动恢复:已重置中断的出图任务", logger.Int("count", len(imgStale)))
	}

	// 自建商品「批量做商品」的出图在 Product 上异步(images_status=RUNNING):进程中断时
	// 这些卡会永远停在「出图中」,标 FAILED 并退回出图额度(refID=商品 ID)。
	var prodStale []model.Product
	if err := s.db.WithContext(ctx).
		Where("images_status = ?", listingImagesRunning).Find(&prodStale).Error; err != nil {
		return
	}
	for _, p := range prodStale {
		s.db.WithContext(ctx).Model(&model.Product{}).Where("id = ?", p.ID).
			Update("images_status", listingImagesFailed)
		s.quota.Refund(ctx, p.ID, model.UsageImage)
	}
	if len(prodStale) > 0 {
		logger.Info("[agent] 启动恢复:已重置中断的商品出图", logger.Int("count", len(prodStale)))
	}
}

// ── Analyst ─────────────────────────────────────────────────────────────────
//
// 选品分析基于 discover_products 真实榜单数据(EchoTik 定时同步/按需拉取落库),
// LLM 只负责"从候选中筛选 + 给理由",指标(ROI/毛利/趋势)全部由既有换算函数得出,不让模型编数。

const analystSystem = `你是 发现猫 的"选品分析 Agent"。
下面会给你一份 TikTok Shop 真实热销榜单（EchoTik 数据），请结合用户需求从中筛选 3-5 个最值得做的商品。

强制要求：
- 只能从给定榜单中选，externalId 必须原样引用，**绝对不要**编造榜单外的商品或任何数字
- recommended=true 的商品最多 2 个
- reason 是 30 字以内的中文推荐理由，要结合给定的销量/佣金/达人覆盖等数字
- 必须用合法 JSON 输出，**绝对不要**有 markdown 代码块或额外解释

输出严格遵循这个 schema：
{
  "summary": "一段不超过 120 字的整体洞察",
  "picks": [
    { "externalId": "1729384756", "reason": "30字以内理由", "recommended": true }
  ]
}`

type analystOut struct {
	Summary string `json:"summary"`
	Picks   []struct {
		ExternalID  string `json:"externalId"`
		Reason      string `json:"reason"`
		Recommended bool   `json:"recommended"`
	} `json:"picks"`
}

// regionKeywords 用户输入 → 目标区域(命中即追加,无命中默认 US)。
var regionKeywords = []struct {
	kw      string
	regions []string
}{
	{"东南亚", []string{"ID", "TH", "VN"}},
	{"美国", []string{"US"}},
	{"印尼", []string{"ID"}},
	{"印度尼西亚", []string{"ID"}},
	{"泰国", []string{"TH"}},
	{"越南", []string{"VN"}},
	{"马来", []string{"MY"}},
	{"菲律宾", []string{"PH"}},
	{"新加坡", []string{"SG"}},
	{"英国", []string{"GB"}},
}

func detectRegions(input string) []string {
	var out []string
	seen := map[string]bool{}
	for _, e := range regionKeywords {
		if strings.Contains(input, e.kw) {
			for _, r := range e.regions {
				if !seen[r] {
					seen[r] = true
					out = append(out, r)
				}
			}
		}
	}
	if len(out) == 0 {
		out = []string{"US"}
	}
	return out
}

// analystCandidates 取近 72h 抓取过的热销商品(72h 与 EchoTik 日期回退 T-1→T-3 对齐)。
func (s *AgentService) analystCandidates(ctx context.Context, regions []string, limit int) ([]model.DiscoverProduct, error) {
	var dps []model.DiscoverProduct
	err := s.db.WithContext(ctx).
		Where("provider = ? AND region IN ? AND last_fetched_at > ?", "echotik", regions, time.Now().Add(-72*time.Hour)).
		Order("total_sale_cnt DESC").
		Limit(limit).
		Find(&dps).Error
	return dps, err
}

// ranklistFacts 把候选商品压成编号事实块,每商品一行,供 LLM 筛选。
func ranklistFacts(dps []model.DiscoverProduct) string {
	var b strings.Builder
	for i, dp := range dps {
		fmt.Fprintf(&b, "#%d id=%s | %s | %s | 均价$%.2f | 佣金%.1f%% | 销量%d | GMV$%.0f | 达人%d | 视频%d\n",
			i+1, dp.ExternalID, dp.Name, dp.Region,
			float64(dp.AvgPriceCents)/100, dp.CommissionRate,
			dp.TotalSaleCnt, float64(dp.TotalSaleGmv)/100,
			dp.TotalIflCnt, dp.TotalVideoCnt)
	}
	return b.String()
}

// snapshotTrendDelta 批量算每个商品最近两条每日快照的销量变化百分比;不足两天置 0。
func (s *AgentService) snapshotTrendDelta(ctx context.Context, dpIDs []uuid.UUID) map[uuid.UUID]int {
	out := make(map[uuid.UUID]int, len(dpIDs))
	if len(dpIDs) == 0 {
		return out
	}
	var snaps []model.DiscoverSnapshot
	if err := s.db.WithContext(ctx).
		Where("discover_product_id IN ?", dpIDs).
		Order("discover_product_id, dt DESC").
		Find(&snaps).Error; err != nil {
		return out
	}
	latest := map[uuid.UUID][]int{}
	for _, sn := range snaps {
		if len(latest[sn.DiscoverProductID]) < 2 {
			latest[sn.DiscoverProductID] = append(latest[sn.DiscoverProductID], sn.TotalSaleCnt)
		}
	}
	for id, vals := range latest {
		if len(vals) == 2 && vals[1] > 0 {
			out[id] = (vals[0] - vals[1]) * 100 / vals[1]
		}
	}
	return out
}

// ensureCandidates 候选为空时的兜底:live 配置现场刷一次榜单;mock 模式触发 mock 落库。
func (s *AgentService) ensureCandidates(ctx context.Context, regions []string, limit int) ([]model.DiscoverProduct, error) {
	dps, err := s.analystCandidates(ctx, regions, limit)
	if err != nil || len(dps) > 0 {
		return dps, err
	}
	p := echotik.RanklistParams{Region: regions[0], RankType: 1, RankField: 1, PageSize: 30}
	if s.discover.echo.Configured() {
		if _, err := s.discover.RefreshRanklist(ctx, p); err != nil {
			logger.Warn("[agent] analyst 现场刷新榜单失败", logger.Err(err))
		}
	} else {
		// mock 模式:Ranklist 会把预置商品 upsert 进 discover_products,本地无凭证也能演示。
		if _, err := s.discover.Ranklist(ctx, uuid.Nil, p); err != nil {
			logger.Warn("[agent] analyst mock 榜单落库失败", logger.Err(err))
		}
	}
	return s.analystCandidates(ctx, regions, limit)
}

func (s *AgentService) runAnalyst(ctx context.Context, wsID uuid.UUID, input string) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请在服务端 .env 设置 OPENROUTER_API_KEY")
	}

	regions := detectRegions(input)
	candidates, err := s.ensureCandidates(ctx, regions, 30)
	if err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("查询选品候选失败: %w", err)
	}
	if len(candidates) == 0 {
		// 数据未就绪不算系统错误:DONE + 引导,不回退编造模式(避免污染选品库)。
		return "选品榜单数据暂未就绪。请先到【发现 → 商品】浏览一次榜单，或稍后重试。", nil, llm.Usage{}, nil
	}
	byExternalID := make(map[string]model.DiscoverProduct, len(candidates))
	for _, dp := range candidates {
		byExternalID[dp.ExternalID] = dp
	}

	user := fmt.Sprintf("用户需求：%s\n\n候选榜单（%s 近 3 日热销，按销量降序）：\n%s",
		input, strings.Join(regions, "/"), ranklistFacts(candidates))
	res, err := s.llm.Chat(ctx, analystSystem, user, true, 1800)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}
	var out analystOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("解析模型输出失败: %w", err)
	}

	// 防幻觉:externalId 必须在候选内,找不到的丢弃。
	type pick struct {
		dp          model.DiscoverProduct
		reason      string
		recommended bool
	}
	var picks []pick
	for _, p := range out.Picks {
		dp, ok := byExternalID[strings.TrimSpace(p.ExternalID)]
		if !ok {
			logger.Warn("[agent] analyst 丢弃榜单外 externalId", logger.String("id", p.ExternalID))
			continue
		}
		picks = append(picks, pick{dp: dp, reason: p.Reason, recommended: p.Recommended})
	}
	if len(picks) == 0 {
		return "", nil, llm.Usage{}, fmt.Errorf("模型未给出有效选品")
	}

	dpIDs := make([]uuid.UUID, len(picks))
	for i, p := range picks {
		dpIDs[i] = p.dp.ID
	}
	trendByID := s.snapshotTrendDelta(ctx, dpIDs)

	// 写入选品库:指标用既有换算函数,不采信模型数字;同款已存在(唯一索引)则视为重新评估走更新。
	type created struct {
		ID          string `json:"id"`
		Title       string `json:"title"`
		RoiScore    int    `json:"roiScore"`
		Recommended bool   `json:"recommended"`
		Reason      string `json:"reason"`
		ExternalID  string `json:"externalId"`
		Region      string `json:"region"`
	}
	var createdList []created
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, p := range picks {
			dp := p.dp
			status := model.ProductEvaluating
			if p.recommended {
				status = model.ProductRecommended
			}
			priceCents := dp.AvgPriceCents
			costCents := echotik.EstimateLandedCost(priceCents, dp.Name, dp.Region).TotalCents
			roi := echotik.RoiScore(dp.TotalSaleCnt, dp.TotalIflCnt)
			note := p.reason + " · 来自 EchoTik " + dp.Region
			emoji := echotik.GuessEmoji(dp.Name)

			var existing model.Product
			e := tx.Where("workspace_id = ? AND discover_product_id = ?", wsID, dp.ID).First(&existing).Error
			switch {
			case e == nil:
				if err := tx.Model(&existing).Updates(map[string]any{
					"status": status, "note": note, "roi_score": roi,
					"monthly_sales": dp.TotalSaleCnt, "trend_delta": trendByID[dp.ID],
				}).Error; err != nil {
					return err
				}
				createdList = append(createdList, created{
					ID: existing.ID.String(), Title: existing.Title, RoiScore: roi,
					Recommended: p.recommended, Reason: p.reason, ExternalID: dp.ExternalID, Region: dp.Region,
				})
			case errors.Is(e, gorm.ErrRecordNotFound):
				dpID := dp.ID
				prod := model.Product{
					WorkspaceID:       wsID,
					DiscoverProductID: &dpID,
					Title:             dp.Name,
					Category:          "TikTok Shop 爆品",
					Emoji:             &emoji,
					PriceCents:        priceCents,
					CostCents:         costCents,
					CostSource:        model.CostSourceEstimate,
					MarginPct:         echotik.EstimateMarginPct(priceCents, costCents),
					RoiScore:          roi,
					MonthlySales:      dp.TotalSaleCnt,
					TrendDelta:        trendByID[dp.ID],
					Status:            status,
					Note:              &note,
				}
				if err := tx.Create(&prod).Error; err != nil {
					return err
				}
				createdList = append(createdList, created{
					ID: prod.ID.String(), Title: prod.Title, RoiScore: roi,
					Recommended: p.recommended, Reason: p.reason, ExternalID: dp.ExternalID, Region: dp.Region,
				})
			default:
				return e
			}
		}
		return nil
	})
	if err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("写入选品库失败: %w", err)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "🔎 分析师从 %d 个真实热销品中筛出 %d 个匹配项：\n\n", len(candidates), len(picks))
	for i, p := range picks {
		dp := p.dp
		fmt.Fprintf(&b, "%02d. %s %s [%s] · ROI %d · 销量 %d · 佣金 %.1f%%",
			i+1, echotik.GuessEmoji(dp.Name), dp.Name, dp.Region,
			echotik.RoiScore(dp.TotalSaleCnt, dp.TotalIflCnt), dp.TotalSaleCnt, dp.CommissionRate)
		if p.recommended {
			b.WriteString(" · ⭐ 推荐")
		}
		fmt.Fprintf(&b, "\n    %s\n", p.reason)
	}
	fmt.Fprintf(&b, "\n→ %s\n\n已自动写入【选品库】。基于 EchoTik %s 近 3 日真实热销榜筛选。",
		out.Summary, strings.Join(regions, "/"))

	meta := map[string]any{"source": "discover.ranklist", "products": createdList, "summary": out.Summary}
	return b.String(), meta, res.Usage, nil
}
