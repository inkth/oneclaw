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

// monthCredits 汇总当月用量:返回按 kind 的原始次数,以及折算后的总积分。
// 校验(CheckAndRecord)与汇总(Usage)共用,避免两处折算口径漂移。db 可传事务 tx。
func monthCredits(ctx context.Context, db *gorm.DB, wsID uuid.UUID) (total int, counts map[string]int, err error) {
	type row struct {
		Kind string
		Cnt  int
	}
	var rows []row
	if err = db.WithContext(ctx).Model(&model.UsageRecord{}).
		Select("kind, COALESCE(SUM(qty),0) AS cnt").
		Where("workspace_id = ? AND created_at >= ?", wsID, monthStart(time.Now())).
		Group("kind").Scan(&rows).Error; err != nil {
		return 0, nil, apperr.Wrap(apperr.CodeInternal, "查询用量失败", err)
	}
	counts = map[string]int{}
	for _, r := range rows {
		counts[r.Kind] = r.Cnt
		total += model.CreditsFor(r.Kind, r.Cnt)
	}
	return total, counts, nil
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
		limit := model.PlanCredits(plan)
		billable := false
		if limit >= 0 {
			// FREE/PRO:硬上限,超额拒绝。
			cost := model.CreditsFor(kind, qty)
			used, _, err := monthCredits(ctx, tx, wsID)
			if err != nil {
				return err
			}
			if used+cost > limit {
				return apperr.New(apperr.CodeQuotaExceeded,
					fmt.Sprintf("本月积分已用完(%d/%d),升级方案可继续", used, limit))
			}
		} else {
			// TEAM(不限):软基线,本月已超基线的部分标记为待结算,不阻断出片。
			used, _, err := monthCredits(ctx, tx, wsID)
			if err != nil {
				return err
			}
			if used >= model.TeamBaselineCredits {
				billable = true
			}
		}
		rec := model.UsageRecord{WorkspaceID: wsID, Kind: kind, Qty: qty, RefID: refID, Billable: billable}
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

// CreditItem 积分余额:used/limit(单位:积分,limit=-1 不限)。
type CreditItem struct {
	Used  int `json:"used"`
	Limit int `json:"limit"`
}

// UsageBreakdown 当月各动作原始次数(明细行展示用,不作限额)。
type UsageBreakdown struct {
	AgentTasks int `json:"agentTasks"`
	Videos     int `json:"videos"`
	Images     int `json:"images"`
}

// UsageSummary 工作台当月用量总览(settings 页 / 驾驶舱用)。
type UsageSummary struct {
	Plan          string         `json:"plan"`
	PlanExpiresAt *time.Time     `json:"planExpiresAt,omitempty"`
	PeriodStart   time.Time      `json:"periodStart"`
	Credits       CreditItem     `json:"credits"`      // 统一积分池
	Breakdown     UsageBreakdown `json:"breakdown"`    // 各动作次数明细
	CreditCosts   map[string]int `json:"creditCosts"`  // 积分单价表,前端动作处标识用
	CostCents     int            `json:"costCents"`    // 当月 LLM+生成 实际成本(任务+视频累计)
	BillableCredits int          `json:"billableCredits"` // TEAM 超基线的待结算积分(其他档恒 0)
	OverflowCents   int          `json:"overflowCents"`   // 待结算积分折算金额(分)
}

// Usage 汇总当月用量与方案信息。
func (s *QuotaService) Usage(ctx context.Context, wsID uuid.UUID) (*UsageSummary, error) {
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	plan := s.EffectivePlan(ctx, &ws)
	start := monthStart(time.Now())

	usedCredits, counts, err := monthCredits(ctx, s.db, wsID)
	if err != nil {
		return nil, err
	}

	var taskCost, videoCost int64
	s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Select("COALESCE(SUM(cost_cents),0)").
		Where("workspace_id = ? AND created_at >= ?", wsID, start).Scan(&taskCost)
	s.db.WithContext(ctx).Model(&model.Video{}).
		Select("COALESCE(SUM(cost_cents),0)").
		Where("workspace_id = ? AND created_at >= ?", wsID, start).Scan(&videoCost)

	// TEAM 超基线的待结算用量(其他档 billable 恒 false,故为 0)。
	billableCredits := 0
	{
		type brow struct {
			Kind string
			Cnt  int
		}
		var brows []brow
		s.db.WithContext(ctx).Model(&model.UsageRecord{}).
			Select("kind, COALESCE(SUM(qty),0) AS cnt").
			Where("workspace_id = ? AND created_at >= ? AND billable = ?", wsID, start, true).
			Group("kind").Scan(&brows)
		for _, r := range brows {
			billableCredits += model.CreditsFor(r.Kind, r.Cnt)
		}
	}

	return &UsageSummary{
		Plan:          plan,
		PlanExpiresAt: ws.PlanExpiresAt,
		PeriodStart:   start,
		Credits:       CreditItem{Used: usedCredits, Limit: model.PlanCredits(plan)},
		Breakdown: UsageBreakdown{
			AgentTasks: counts[model.UsageAgentTask],
			Videos:     counts[model.UsageVideo],
			Images:     counts[model.UsageImage],
		},
		CreditCosts:     model.CreditCosts(),
		CostCents:       int(taskCost + videoCost),
		BillableCredits: billableCredits,
		OverflowCents:   billableCredits * model.TeamOverflowCentsPerKCredit / 1000,
	}, nil
}
