package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
)

// QuotaService 月度配额:消耗前查余量(CheckAndRecord),终态失败按 ref 退回(Refund)。
// 计费窗口为自然月(中国时区,与 DB 会话时区一致)。
type QuotaService struct {
	db *gorm.DB
}

func NewQuotaService(db *gorm.DB) *QuotaService {
	return &QuotaService{db: db}
}

// cnZone 中国无夏令时,固定 +8 即可,不依赖容器 tzdata。
var cnZone = time.FixedZone("CST", 8*3600)

func monthStart(now time.Time) time.Time {
	n := now.In(cnZone)
	return time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, cnZone)
}

var usageKindLabels = map[string]string{
	model.UsageAgentTask: "Agent 任务",
	model.UsageVideo:     "视频生成",
	model.UsageImage:     "出图",
}

// EffectivePlan 返回工作台当前生效方案:到期的付费方案惰性降回 FREE(顺手落库)。
func (s *QuotaService) EffectivePlan(ctx context.Context, ws *model.Workspace) string {
	if ws.Plan == model.PlanFree {
		return model.PlanFree
	}
	if ws.PlanExpiresAt != nil && ws.PlanExpiresAt.Before(time.Now()) {
		logger.Info("[quota] 方案到期,降回 FREE", logger.String("ws", ws.ID.String()))
		s.db.WithContext(ctx).Model(&model.Workspace{}).Where("id = ?", ws.ID).
			Updates(map[string]any{"plan": model.PlanFree, "plan_expires_at": nil})
		ws.Plan = model.PlanFree
		ws.PlanExpiresAt = nil
		return model.PlanFree
	}
	return ws.Plan
}

// CheckAndRecord 原子地"查余量 + 记一笔消耗"。超额返回 QUOTA_EXCEEDED。
// 锁工作台行防并发双花;refID 供终态失败时退回。
func (s *QuotaService) CheckAndRecord(ctx context.Context, wsID uuid.UUID, kind string, qty int, refID *uuid.UUID) error {
	if qty <= 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var ws model.Workspace
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&ws, "id = ?", wsID).Error; err != nil {
			return apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
		}
		plan := ws.Plan
		if plan != model.PlanFree && ws.PlanExpiresAt != nil && ws.PlanExpiresAt.Before(time.Now()) {
			plan = model.PlanFree
			if err := tx.Model(&model.Workspace{}).Where("id = ?", ws.ID).
				Updates(map[string]any{"plan": model.PlanFree, "plan_expires_at": nil}).Error; err != nil {
				return apperr.Wrap(apperr.CodeInternal, "方案降级失败", err)
			}
		}
		limit := limitFor(plan, kind)
		if limit >= 0 {
			var used int64
			if err := tx.Model(&model.UsageRecord{}).
				Select("COALESCE(SUM(qty), 0)").
				Where("workspace_id = ? AND kind = ? AND created_at >= ?", wsID, kind, monthStart(time.Now())).
				Scan(&used).Error; err != nil {
				return apperr.Wrap(apperr.CodeInternal, "查询用量失败", err)
			}
			if used+int64(qty) > int64(limit) {
				label := usageKindLabels[kind]
				return apperr.New(apperr.CodeQuotaExceeded,
					fmt.Sprintf("本月%s额度已用完(%d/%d),升级方案可继续", label, used, limit))
			}
		}
		rec := model.UsageRecord{WorkspaceID: wsID, Kind: kind, Qty: qty, RefID: refID}
		if err := tx.Create(&rec).Error; err != nil {
			return apperr.Wrap(apperr.CodeInternal, "记录用量失败", err)
		}
		return nil
	})
}

// Refund 按来源退回配额(任务/视频终态失败时调用,best-effort)。
func (s *QuotaService) Refund(ctx context.Context, refID uuid.UUID, kind string) {
	if err := s.db.WithContext(ctx).
		Where("ref_id = ? AND kind = ?", refID, kind).
		Delete(&model.UsageRecord{}).Error; err != nil {
		logger.Warn("[quota] 退回用量失败", logger.String("ref", refID.String()), logger.Err(err))
	}
}

func limitFor(plan, kind string) int {
	q := model.QuotaFor(plan)
	switch kind {
	case model.UsageAgentTask:
		return q.AgentTasks
	case model.UsageVideo:
		return q.Videos
	case model.UsageImage:
		return q.Images
	default:
		return -1
	}
}

// UsageItem 单类用量:used/limit(-1 不限)。
type UsageItem struct {
	Used  int `json:"used"`
	Limit int `json:"limit"`
}

// UsageSummary 工作台当月用量总览(settings 页用)。
type UsageSummary struct {
	Plan          string     `json:"plan"`
	PlanExpiresAt *time.Time `json:"planExpiresAt,omitempty"`
	PeriodStart   time.Time  `json:"periodStart"`
	AgentTasks    UsageItem  `json:"agentTasks"`
	Videos        UsageItem  `json:"videos"`
	Images        UsageItem  `json:"images"`
	CostCents     int        `json:"costCents"` // 当月 LLM+生成 实际成本(任务+视频累计)
}

// Usage 汇总当月用量与方案信息。
func (s *QuotaService) Usage(ctx context.Context, wsID uuid.UUID) (*UsageSummary, error) {
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	plan := s.EffectivePlan(ctx, &ws)
	start := monthStart(time.Now())

	type row struct {
		Kind string
		Sum  int
	}
	var rows []row
	if err := s.db.WithContext(ctx).Model(&model.UsageRecord{}).
		Select("kind, COALESCE(SUM(qty),0) AS sum").
		Where("workspace_id = ? AND created_at >= ?", wsID, start).
		Group("kind").Scan(&rows).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询用量失败", err)
	}
	used := map[string]int{}
	for _, r := range rows {
		used[r.Kind] = r.Sum
	}

	var taskCost, videoCost int64
	s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Select("COALESCE(SUM(cost_cents),0)").
		Where("workspace_id = ? AND created_at >= ?", wsID, start).Scan(&taskCost)
	s.db.WithContext(ctx).Model(&model.Video{}).
		Select("COALESCE(SUM(cost_cents),0)").
		Where("workspace_id = ? AND created_at >= ?", wsID, start).Scan(&videoCost)

	q := model.QuotaFor(plan)
	return &UsageSummary{
		Plan:          plan,
		PlanExpiresAt: ws.PlanExpiresAt,
		PeriodStart:   start,
		AgentTasks:    UsageItem{Used: used[model.UsageAgentTask], Limit: q.AgentTasks},
		Videos:        UsageItem{Used: used[model.UsageVideo], Limit: q.Videos},
		Images:        UsageItem{Used: used[model.UsageImage], Limit: q.Images},
		CostCents:     int(taskCost + videoCost),
	}, nil
}
