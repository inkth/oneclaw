package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

// QuotaService 配额:消耗前查余量(CheckAndRecord),终态失败按 ref 退回(Refund)。
// 计费窗口为「订阅月周期」(anniversary,中国时区):付费档锚定付费日、FREE/未付费锚定注册日。
type QuotaService struct {
	db *gorm.DB
}

func NewQuotaService(db *gorm.DB) *QuotaService {
	return &QuotaService{db: db}
}

// cnZone 中国无夏令时,固定 +8 即可,不依赖容器 tzdata。
var cnZone = time.FixedZone("CST", 8*3600)

// shiftMonth 把 (year, month) 平移 delta 个月并规整(delta 可负)。
func shiftMonth(year int, month time.Month, delta int) (int, time.Month) {
	t := int(month) - 1 + delta
	y := year + t/12
	m := t % 12
	if m < 0 {
		m += 12
		y--
	}
	return y, time.Month(m + 1)
}

// anchorInMonth 返回「锚点日 day」落在 year-month 的那天 00:00(中国时区);
// 该月不足 day 天(如 31 号遇 2 月)则 clamp 到月末。订阅月周期的边界点。
func anchorInMonth(year int, month time.Month, day int) time.Time {
	first := time.Date(year, month, 1, 0, 0, 0, 0, cnZone)
	if last := first.AddDate(0, 1, -1).Day(); day > last {
		day = last
	}
	return time.Date(year, month, day, 0, 0, 0, 0, cnZone)
}

// cycleBounds 返回 now 所在「订阅月周期」的 [start, end)(中国时区,半开区间)。
// 锚点取 anchor 的「日」按订阅月推进,月末自动 clamp。
func cycleBounds(anchor, now time.Time) (start, end time.Time) {
	day := anchor.In(cnZone).Day()
	n := now.In(cnZone)
	this := anchorInMonth(n.Year(), n.Month(), day)
	if !n.Before(this) { // now ≥ 当月锚点 → 周期从当月锚点起
		ny, nm := shiftMonth(n.Year(), n.Month(), 1)
		return this, anchorInMonth(ny, nm, day)
	}
	py, pm := shiftMonth(n.Year(), n.Month(), -1) // now 未到当月锚点 → 周期从上月锚点起
	return anchorInMonth(py, pm, day), this
}

// billingAnchor 计费周期锚点:付费档(未降级)锚定付费日(BillingCycleAnchor),
// FREE / 未付费 / 到期降级锚定注册日(CreatedAt)。
func billingAnchor(plan string, ws *model.Workspace) time.Time {
	if plan != model.PlanFree && ws.BillingCycleAnchor != nil {
		return *ws.BillingCycleAnchor
	}
	return ws.CreatedAt
}

// cycleCredits 汇总周期窗口 [start,end) 的用量:返回按 kind 原始次数与折算总积分。
// 校验(CheckAndRecord)与汇总(Usage)共用,避免两处折算口径漂移。db 可传事务 tx。
// counts=SUM(qty)(积分折算/张数口径);records=记录条数(「N 条出片」这类次数口径 ——
// 出片按秒计费后 qty 是秒数,不能再当条数用)。
func cycleCredits(ctx context.Context, db *gorm.DB, wsID uuid.UUID, start, end time.Time) (total int, counts, records map[string]int, err error) {
	type row struct {
		Kind string
		Cnt  int
		Recs int
	}
	var rows []row
	if err = db.WithContext(ctx).Model(&model.UsageRecord{}).
		Select("kind, COALESCE(SUM(qty),0) AS cnt, COUNT(*) AS recs").
		Where("workspace_id = ? AND created_at >= ? AND created_at < ?", wsID, start, end).
		Group("kind").Scan(&rows).Error; err != nil {
		return 0, nil, nil, apperr.Wrap(apperr.CodeInternal, "查询用量失败", err)
	}
	counts, records = map[string]int{}, map[string]int{}
	for _, r := range rows {
		counts[r.Kind] = r.Cnt
		records[r.Kind] = r.Recs
		total += model.CreditsFor(r.Kind, r.Cnt)
	}
	return total, counts, records, nil
}

// bonusCredits 汇总该 workspace 当前有效的赠送积分(ExpiresAt 未过);抬高本周期额度上限。
// db 可传事务 tx。无赠送时返回 0(绝大多数工作台)。
func bonusCredits(ctx context.Context, db *gorm.DB, wsID uuid.UUID, now time.Time) int {
	var sum int64
	db.WithContext(ctx).Model(&model.BonusCreditGrant{}).
		Where("workspace_id = ? AND expires_at > ?", wsID, now).
		Select("COALESCE(SUM(credits),0)").Scan(&sum)
	return int(sum)
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

// quotaDecision 纯额度判定:给定方案、动作、数量与本周期已用积分,返回是否放行 + 本次是否计入超额待结算。
// 与 CheckAndRecord 的取数/落库分离,便于无 DB 单测覆盖边界。
//   - FREE/PRO(limit≥0):硬上限,used + 本次消耗 > limit 即拒绝(allowed=false)。
//   - TEAM(limit<0):不限量,但 used 已达基线则本次标记 billable(待结算),不阻断出片。
//   - bonus:赠送积分,抬高 FREE/PRO 的本周期上限(limit+bonus);TEAM(limit<0)不受影响。
func quotaDecision(plan, kind string, qty, used, bonus int) (allowed, billable bool) {
	limit := model.PlanCredits(plan)
	if limit >= 0 {
		return used+model.CreditsFor(kind, qty) <= limit+bonus, false
	}
	return true, used >= model.TeamBaselineCredits
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
		now := time.Now()
		start, end := cycleBounds(billingAnchor(plan, &ws), now)
		used, _, _, err := cycleCredits(ctx, tx, wsID, start, end)
		if err != nil {
			return err
		}
		bonus := bonusCredits(ctx, tx, wsID, now)
		limit := model.PlanCredits(plan)
		allowed, billable := quotaDecision(plan, kind, qty, used, bonus)
		if !allowed {
			// FREE/PRO 硬上限:本周期超额拒绝(TEAM 不限量,只在 quotaDecision 里标 billable)。
			return apperr.New(apperr.CodeQuotaExceeded,
				fmt.Sprintf("本周期积分已用完(%d/%d),升级方案可继续", used, limit+bonus))
		}
		rec := model.UsageRecord{WorkspaceID: wsID, Kind: kind, Qty: qty, RefID: refID, Billable: billable}
		if err := tx.Create(&rec).Error; err != nil {
			return apperr.Wrap(apperr.CodeInternal, "记录用量失败", err)
		}
		return nil
	})
}

// EnsureBudget 只读预检:本周期剩余积分是否够 need 这一整批消耗。不够返回 QUOTA_EXCEEDED。
// 供批量操作的「整批前置校验」用(避免建到一半余额耗尽);逐笔 CheckAndRecord 仍是权威扣减。
func (s *QuotaService) EnsureBudget(ctx context.Context, wsID uuid.UUID, need int) error {
	if need <= 0 {
		return nil
	}
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		return apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	plan := s.EffectivePlan(ctx, &ws)
	limit := model.PlanCredits(plan)
	if limit < 0 { // TEAM 不限量,不阻断
		return nil
	}
	now := time.Now()
	start, end := cycleBounds(billingAnchor(plan, &ws), now)
	used, _, _, err := cycleCredits(ctx, s.db, wsID, start, end)
	if err != nil {
		return err
	}
	limit += bonusCredits(ctx, s.db, wsID, now) // 赠送积分抬高本周期上限
	if used+need > limit {
		remain := limit - used
		if remain < 0 {
			remain = 0
		}
		return apperr.New(apperr.CodeQuotaExceeded,
			fmt.Sprintf("本周期积分不足(剩 %d,本批需 %d),请减少数量或升级方案", remain, need))
	}
	return nil
}

// CurrentCycleEnd 返回工作台当前计费周期终点(下次额度重置时刻)。
// 管理员手动补积分(BonusCreditGrant)用它作 ExpiresAt,使赠送只抬高本周期上限、周期末自动回落
// —— 与邀请赠送积分口径一致。
func (s *QuotaService) CurrentCycleEnd(ctx context.Context, wsID uuid.UUID) (time.Time, error) {
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		return time.Time{}, apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	plan := s.EffectivePlan(ctx, &ws)
	_, end := cycleBounds(billingAnchor(plan, &ws), time.Now())
	return end, nil
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

// UsageSummary 工作台「当前计费周期」用量总览(settings 页 / 驾驶舱用)。
type UsageSummary struct {
	Plan            string         `json:"plan"`
	PlanExpiresAt   *time.Time     `json:"planExpiresAt,omitempty"`
	PeriodStart     time.Time      `json:"periodStart"`     // 当前计费周期起点(含)
	PeriodEnd       time.Time      `json:"periodEnd"`       // 周期终点(开区间,即下次额度重置时刻)
	Credits         CreditItem     `json:"credits"`         // 统一积分池
	Breakdown       UsageBreakdown `json:"breakdown"`       // 各动作次数明细
	CreditCosts     map[string]int `json:"creditCosts"`     // 积分单价表,前端动作处标识用
	CostCents       int            `json:"costCents"`       // 当月 LLM+生成 实际成本(任务+视频累计)
	BillableCredits int            `json:"billableCredits"` // TEAM 超基线的待结算积分(其他档恒 0)
	OverflowCents   int            `json:"overflowCents"`   // 待结算积分折算金额(分)
}

// Usage 汇总当月用量与方案信息。
func (s *QuotaService) Usage(ctx context.Context, wsID uuid.UUID) (*UsageSummary, error) {
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	now := time.Now()
	plan := s.EffectivePlan(ctx, &ws)
	start, end := cycleBounds(billingAnchor(plan, &ws), now)

	usedCredits, counts, records, err := cycleCredits(ctx, s.db, wsID, start, end)
	if err != nil {
		return nil, err
	}

	var taskCost, videoCost int64
	s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Select("COALESCE(SUM(cost_cents),0)").
		Where("workspace_id = ? AND created_at >= ? AND created_at < ?", wsID, start, end).Scan(&taskCost)
	s.db.WithContext(ctx).Model(&model.Video{}).
		Select("COALESCE(SUM(cost_cents),0)").
		Where("workspace_id = ? AND created_at >= ? AND created_at < ?", wsID, start, end).Scan(&videoCost)

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
			Where("workspace_id = ? AND created_at >= ? AND created_at < ? AND billable = ?", wsID, start, end, true).
			Group("kind").Scan(&brows)
		for _, r := range brows {
			billableCredits += model.CreditsFor(r.Kind, r.Cnt)
		}
	}

	// 赠送积分抬高本周期上限;TEAM(limit=-1)不受影响,仍返回 -1(不限)。
	planLimit := model.PlanCredits(plan)
	if planLimit >= 0 {
		planLimit += bonusCredits(ctx, s.db, wsID, now)
	}

	return &UsageSummary{
		Plan:          plan,
		PlanExpiresAt: ws.PlanExpiresAt,
		PeriodStart:   start,
		PeriodEnd:     end,
		Credits:       CreditItem{Used: usedCredits, Limit: planLimit},
		Breakdown: UsageBreakdown{
			AgentTasks: records[model.UsageAgentTask],
			Videos:     records[model.UsageVideo], // 条数(qty 现在是秒数,SUM(qty) 是总秒)
			Images:     counts[model.UsageImage],  // 张数(qty=张,SUM 正确)
		},
		CreditCosts:     model.CreditCosts(),
		CostCents:       int(taskCost + videoCost),
		BillableCredits: billableCredits,
		OverflowCents:   model.OverflowCents(billableCredits),
	}, nil
}
