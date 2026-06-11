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

// AgentService 派发并异步执行 Agent 任务(QUEUED→RUNNING→DONE/FAILED)。
type AgentService struct {
	db     *gorm.DB
	llm    *llm.Client
	videos *VideoService // director 用来下发视频
}

func NewAgentService(db *gorm.DB, l *llm.Client, videos *VideoService) *AgentService {
	return &AgentService{db: db, llm: l, videos: videos}
}

var validAgents = map[string]bool{
	model.AgentAnalyst:  true,
	model.AgentDirector: true,
	model.AgentListing:  true,
}

// Create 建 QUEUED 任务并起 goroutine 异步执行,立即返回任务。
func (s *AgentService) Create(ctx context.Context, wsID uuid.UUID, agent, input string) (*model.AgentTask, error) {
	agent = strings.ToUpper(strings.TrimSpace(agent))
	if !validAgents[agent] {
		return nil, apperr.BadRequest("未知的 agent 类型")
	}
	if strings.TrimSpace(input) == "" {
		return nil, apperr.BadRequest("input 不能为空")
	}
	t := model.AgentTask{WorkspaceID: wsID, Agent: agent, Status: model.TaskQueued, Input: input}
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建任务失败", err)
	}
	// 异步执行:独立 context(请求结束不取消),沿用 service 的 db/llm。
	go s.execute(t.ID, wsID, agent, input)
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
func (s *AgentService) execute(taskID, wsID uuid.UUID, agent, input string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
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
	case model.AgentAnalyst:
		output, meta, usage, err = s.runAnalyst(ctx, wsID, input)
	case model.AgentDirector:
		output, meta, usage, err = s.runDirector(ctx, wsID, input)
	case model.AgentListing:
		output, meta, usage, err = s.runListing(ctx, wsID, input)
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
}

func (s *AgentService) fail(ctx context.Context, taskID uuid.UUID, msg string) {
	logger.Warn("[agent] 任务失败", logger.String("task", taskID.String()), logger.String("err", msg))
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
		Updates(map[string]any{"status": model.TaskFailed, "error_message": msg, "finished_at": time.Now()})
}

// ── Analyst ─────────────────────────────────────────────────────────────────

const analystSystem = `你是 OneClaw 的"选品分析 Agent"。
你的任务是基于用户的需求描述，给出 3-5 个跨境电商高潜力选品建议。

强制要求：
- 必须用合法 JSON 输出，**绝对不要**有 markdown 代码块或额外解释
- 价格 / 成本必须是美元，转成"美分"整数（如 24.99 美元 → 2499）
- ROI 评分 0-100，越高越值得做
- trendDelta 是过去 14 天热度变化百分比（正/负整数）
- recommended=true 的产品最多 2 个

输出严格遵循这个 schema：
{
  "summary": "一段不超过 120 字的整体洞察",
  "products": [
    { "title": "英文商品名+关键参数", "category": "中文品类", "emoji": "单个emoji",
      "priceCents": 2499, "costCents": 620, "marginPct": 62, "roiScore": 94,
      "monthlySales": 12400, "trendDelta": 218, "note": "30字以内理由", "recommended": true }
  ]
}`

type analystOut struct {
	Summary  string `json:"summary"`
	Products []struct {
		Title        string `json:"title"`
		Category     string `json:"category"`
		Emoji        string `json:"emoji"`
		PriceCents   int    `json:"priceCents"`
		CostCents    int    `json:"costCents"`
		MarginPct    int    `json:"marginPct"`
		RoiScore     int    `json:"roiScore"`
		MonthlySales int    `json:"monthlySales"`
		TrendDelta   int    `json:"trendDelta"`
		Note         string `json:"note"`
		Recommended  bool   `json:"recommended"`
	} `json:"products"`
}

func (s *AgentService) runAnalyst(ctx context.Context, wsID uuid.UUID, input string) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请在服务端 .env 设置 OPENROUTER_API_KEY")
	}
	res, err := s.llm.Chat(ctx, analystSystem, input, true, 1800)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}
	var out analystOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("解析模型输出失败: %w", err)
	}
	if len(out.Products) == 0 {
		return "", nil, llm.Usage{}, fmt.Errorf("模型未给出任何选品")
	}

	// 写入选品库
	type created struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		RoiScore int    `json:"roiScore"`
	}
	var createdList []created
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, p := range out.Products {
			emoji := p.Emoji
			status := model.ProductEvaluating
			if p.Recommended {
				status = model.ProductRecommended
			}
			prod := model.Product{
				WorkspaceID: wsID, Title: p.Title, Category: p.Category, Emoji: &emoji,
				PriceCents: p.PriceCents, CostCents: p.CostCents, MarginPct: p.MarginPct,
				RoiScore: p.RoiScore, MonthlySales: p.MonthlySales, TrendDelta: p.TrendDelta,
				Status: status,
			}
			if p.Note != "" {
				prod.Note = &p.Note
			}
			if err := tx.Create(&prod).Error; err != nil {
				return err
			}
			createdList = append(createdList, created{ID: prod.ID.String(), Title: p.Title, RoiScore: p.RoiScore})
		}
		return nil
	})
	if err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("写入选品库失败: %w", err)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "🔎 分析师扫描到 %d 个匹配项：\n\n", len(out.Products))
	for i, p := range out.Products {
		emoji := p.Emoji
		if emoji == "" {
			emoji = "📦"
		}
		fmt.Fprintf(&b, "%02d. %s %s · ROI %d · 月销 %d · 毛利 %d%%", i+1, emoji, p.Title, p.RoiScore, p.MonthlySales, p.MarginPct)
		if p.Recommended {
			b.WriteString(" · ⭐ 推荐")
		}
		b.WriteString("\n")
	}
	fmt.Fprintf(&b, "\n→ %s\n\n已自动写入【选品库】。", out.Summary)

	meta := map[string]any{"products": createdList, "summary": out.Summary}
	return b.String(), meta, res.Usage, nil
}
