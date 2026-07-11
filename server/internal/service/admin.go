package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
)

// AdminService 运营后台聚合服务:平台看板 + 用户管理 + 订单/账单运维 + 审计。
// 组合既有 billing/quota/agency,不重复其事务/计佣/幂等原语;所有写操作留审计(best-effort)。
type AdminService struct {
	db      *gorm.DB
	billing *BillingService
	quota   *QuotaService
	agency  *AgencyService
}

func NewAdminService(db *gorm.DB, billing *BillingService, quota *QuotaService, agency *AgencyService) *AdminService {
	return &AdminService{db: db, billing: billing, quota: quota, agency: agency}
}

const adminPageSize = 20

// audit 记一条管理员写操作留痕。best-effort:审计写失败只告警,不回滚主操作。
func (s *AdminService) audit(ctx context.Context, adminID uuid.UUID, action, targetType, targetID, detail string) {
	log := model.AdminAuditLog{AdminID: adminID, Action: action, TargetType: targetType, TargetID: targetID, Detail: detail}
	if err := s.db.WithContext(ctx).Create(&log).Error; err != nil {
		logger.Warn("[admin] 审计写入失败", logger.String("action", action), logger.Err(err))
	}
}

// effectivePlanRO 只读地判定有效方案(付费已过期即视为 FREE),不像 quota.EffectivePlan 那样落库降级。
func effectivePlanRO(ws *model.Workspace) string {
	if ws.Plan != model.PlanFree && ws.PlanExpiresAt != nil && ws.PlanExpiresAt.Before(time.Now()) {
		return model.PlanFree
	}
	return ws.Plan
}

// primaryWorkspace 取用户主工作台(其拥有的、最早建的那个);无则 nil。
func (s *AdminService) primaryWorkspace(ctx context.Context, userID uuid.UUID) *model.Workspace {
	var ws model.Workspace
	if err := s.db.WithContext(ctx).Where("owner_id = ?", userID).
		Order("created_at ASC").First(&ws).Error; err != nil {
		return nil
	}
	return &ws
}

// —— Phase 1:平台数据看板 ————————————————————————————————————————

type DashboardPlanDist struct {
	Free int64 `json:"free"`
	Pro  int64 `json:"pro"`
	Team int64 `json:"team"`
}

// Dashboard 平台运营总览(全站聚合,单位:分 / 个)。
type Dashboard struct {
	UserCount            int64             `json:"userCount"`
	NewUsersToday        int64             `json:"newUsersToday"`
	NewUsers7d           int64             `json:"newUsers7d"`
	BannedUserCount      int64             `json:"bannedUserCount"`
	WorkspaceCount       int64             `json:"workspaceCount"`
	PlanDist             DashboardPlanDist `json:"planDist"` // 有效方案分布(付费需未过期)
	PaidOrderCount       int64             `json:"paidOrderCount"`
	RevenueTotalCents    int64             `json:"revenueTotalCents"` // 累计已收(PAID 订单 + 已结算超额账单)
	RevenueMonthCents    int64             `json:"revenueMonthCents"` // 本自然月已收
	VideoUsage           int64             `json:"videoUsage"`        // 累计出片条数
	ImageUsage           int64             `json:"imageUsage"`        // 累计出图张数
	AgentTaskUsage       int64             `json:"agentTaskUsage"`    // 累计 Agent 任务数
	PendingWithdrawals   int64             `json:"pendingWithdrawals"`
	PendingOverflowBills int64             `json:"pendingOverflowBills"`
	AgencyCount          int64             `json:"agencyCount"`
}

func (s *AdminService) Dashboard(ctx context.Context) (*Dashboard, error) {
	db := s.db.WithContext(ctx)
	var d Dashboard

	now := time.Now()
	n := now.In(cnZone)
	startToday := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, cnZone)
	startMonth := time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, cnZone)

	db.Model(&model.User{}).Count(&d.UserCount)
	db.Model(&model.User{}).Where("created_at >= ?", startToday).Count(&d.NewUsersToday)
	db.Model(&model.User{}).Where("created_at >= ?", now.AddDate(0, 0, -7)).Count(&d.NewUsers7d)
	db.Model(&model.User{}).Where("banned_at IS NOT NULL").Count(&d.BannedUserCount)

	db.Model(&model.Workspace{}).Count(&d.WorkspaceCount)
	db.Model(&model.Workspace{}).Where("plan = ? AND plan_expires_at > ?", model.PlanPro, now).Count(&d.PlanDist.Pro)
	db.Model(&model.Workspace{}).Where("plan = ? AND plan_expires_at > ?", model.PlanTeam, now).Count(&d.PlanDist.Team)
	d.PlanDist.Free = d.WorkspaceCount - d.PlanDist.Pro - d.PlanDist.Team // 含到期未惰性降级者

	db.Model(&model.PaymentOrder{}).Where("status = ?", model.OrderPaid).Count(&d.PaidOrderCount)

	var orderRev, overflowRev, orderMonth, overflowMonth int64
	db.Model(&model.PaymentOrder{}).Where("status = ?", model.OrderPaid).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&orderRev)
	db.Model(&model.OverflowBill{}).Where("status = ?", model.OverflowPaid).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&overflowRev)
	db.Model(&model.PaymentOrder{}).Where("status = ? AND paid_at >= ?", model.OrderPaid, startMonth).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&orderMonth)
	db.Model(&model.OverflowBill{}).Where("status = ? AND paid_at >= ?", model.OverflowPaid, startMonth).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&overflowMonth)
	d.RevenueTotalCents = orderRev + overflowRev
	d.RevenueMonthCents = orderMonth + overflowMonth

	type kindCount struct {
		Kind string
		Cnt  int64
	}
	var kc []kindCount
	db.Model(&model.UsageRecord{}).Select("kind, COALESCE(SUM(qty),0) AS cnt").Group("kind").Scan(&kc)
	for _, r := range kc {
		switch r.Kind {
		case model.UsageVideo:
			d.VideoUsage = r.Cnt
		case model.UsageImage:
			d.ImageUsage = r.Cnt
		case model.UsageAgentTask:
			d.AgentTaskUsage = r.Cnt
		}
	}

	db.Model(&model.AgencyWithdrawal{}).Where("status = ?", model.WithdrawalPending).Count(&d.PendingWithdrawals)
	db.Model(&model.OverflowBill{}).Where("status = ?", model.OverflowPending).Count(&d.PendingOverflowBills)
	db.Model(&model.Agency{}).Count(&d.AgencyCount)

	return &d, nil
}

// —— Phase 2:用户管理 ————————————————————————————————————————————

type AdminUserRow struct {
	ID            uuid.UUID  `json:"id"`
	Phone         string     `json:"phone"`
	Name          string     `json:"name,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	BannedAt      *time.Time `json:"bannedAt,omitempty"`
	Plan          string     `json:"plan"` // 主工作台有效方案
	PlanExpiresAt *time.Time `json:"planExpiresAt,omitempty"`
	WorkspaceID   *uuid.UUID `json:"workspaceId,omitempty"`
	IsAgency      bool       `json:"isAgency"`
}

type AdminUserList struct {
	Rows     []AdminUserRow `json:"rows"`
	Total    int64          `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
}

// ListUsers 分页 + 手机号搜索 + 按方案筛选。plan 空=全部;banned=true 仅封禁。
func (s *AdminService) ListUsers(ctx context.Context, q, plan string, banned bool, page int) (*AdminUserList, error) {
	if page < 1 {
		page = 1
	}
	db := s.db.WithContext(ctx).Model(&model.User{})
	if q = strings.TrimSpace(q); q != "" {
		db = db.Where("phone LIKE ?", "%"+q+"%")
	}
	if banned {
		db = db.Where("banned_at IS NOT NULL")
	}
	if plan != "" {
		// 主工作台(owner)方案为 plan;付费需未过期。用 EXISTS 子查询避免 join 破坏分页。
		sub := "EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = users.id AND w.plan = ?"
		args := []any{plan}
		if plan != model.PlanFree {
			sub += " AND w.plan_expires_at > ?"
			args = append(args, time.Now())
		}
		sub += ")"
		db = db.Where(sub, args...)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "统计用户失败", err)
	}
	var users []model.User
	if err := db.Order("created_at DESC").
		Limit(adminPageSize).Offset((page - 1) * adminPageSize).Find(&users).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询用户失败", err)
	}

	rows := make([]AdminUserRow, 0, len(users))
	for _, u := range users {
		row := AdminUserRow{ID: u.ID, CreatedAt: u.CreatedAt, BannedAt: u.BannedAt}
		if u.Phone != nil {
			row.Phone = *u.Phone
		}
		if u.Name != nil {
			row.Name = *u.Name
		}
		if ws := s.primaryWorkspace(ctx, u.ID); ws != nil {
			row.Plan = effectivePlanRO(ws)
			row.PlanExpiresAt = ws.PlanExpiresAt
			id := ws.ID
			row.WorkspaceID = &id
		} else {
			row.Plan = model.PlanFree
		}
		var agCnt int64
		s.db.WithContext(ctx).Model(&model.Agency{}).Where("user_id = ?", u.ID).Count(&agCnt)
		row.IsAgency = agCnt > 0
		rows = append(rows, row)
	}
	return &AdminUserList{Rows: rows, Total: total, Page: page, PageSize: adminPageSize}, nil
}

type AdminUserWorkspace struct {
	Workspace model.Workspace `json:"workspace"`
	Usage     *UsageSummary   `json:"usage,omitempty"`
}

type AdminUserDetail struct {
	User          model.User           `json:"user"`
	Workspaces    []AdminUserWorkspace `json:"workspaces"`
	Orders        []model.PaymentOrder `json:"orders"`
	InvitedByCode string               `json:"invitedByCode,omitempty"` // 归因来源代理邀请码
	IsAgency      bool                 `json:"isAgency"`
}

func (s *AdminService) UserDetail(ctx context.Context, userID uuid.UUID) (*AdminUserDetail, error) {
	var u model.User
	if err := s.db.WithContext(ctx).First(&u, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("用户不存在")
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "查询用户失败", err)
	}
	out := &AdminUserDetail{User: u}

	var wss []model.Workspace
	s.db.WithContext(ctx).Where("owner_id = ?", userID).Order("created_at ASC").Find(&wss)
	for i := range wss {
		item := AdminUserWorkspace{Workspace: wss[i]}
		if usage, err := s.quota.Usage(ctx, wss[i].ID); err == nil {
			item.Usage = usage
		}
		out.Workspaces = append(out.Workspaces, item)
	}

	s.db.WithContext(ctx).Where("user_id = ?", userID).Order("created_at DESC").Limit(50).Find(&out.Orders)

	var ref model.AgencyReferral
	if s.db.WithContext(ctx).Where("user_id = ?", userID).First(&ref).Error == nil {
		var ag model.Agency
		if s.db.WithContext(ctx).Select("code").First(&ag, "id = ?", ref.AgencyID).Error == nil {
			out.InvitedByCode = ag.Code
		}
	}
	var agCnt int64
	s.db.WithContext(ctx).Model(&model.Agency{}).Where("user_id = ?", userID).Count(&agCnt)
	out.IsAgency = agCnt > 0
	return out, nil
}

// BanUser 封禁用户(幂等:已封禁不重复置时间)。不能封禁自己。
func (s *AdminService) BanUser(ctx context.Context, adminID, userID uuid.UUID, reason string) error {
	if adminID == userID {
		return apperr.BadRequest("不能封禁自己")
	}
	now := time.Now()
	res := s.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ? AND banned_at IS NULL", userID).
		Update("banned_at", now)
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "封禁失败", res.Error)
	}
	if res.RowsAffected == 0 {
		// 用户不存在或已封禁 —— 区分之。
		var cnt int64
		s.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", userID).Count(&cnt)
		if cnt == 0 {
			return apperr.NotFound("用户不存在")
		}
		return apperr.BadRequest("用户已处于封禁状态")
	}
	s.audit(ctx, adminID, model.AuditUserBan, "user", userID.String(), reason)
	logger.Info("[admin] 封禁用户", logger.String("user", userID.String()), logger.String("by", adminID.String()))
	return nil
}

// UnbanUser 解封(幂等)。
func (s *AdminService) UnbanUser(ctx context.Context, adminID, userID uuid.UUID) error {
	res := s.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ? AND banned_at IS NOT NULL", userID).
		Update("banned_at", nil)
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "解封失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return apperr.BadRequest("用户不存在或未被封禁")
	}
	s.audit(ctx, adminID, model.AuditUserUnban, "user", userID.String(), "")
	logger.Info("[admin] 解封用户", logger.String("user", userID.String()), logger.String("by", adminID.String()))
	return nil
}

// GrantCredits 给工作台手动补积分(客服补偿):落一条 BonusCreditGrant,当周期有效、周期末自动回落。
func (s *AdminService) GrantCredits(ctx context.Context, adminID, wsID uuid.UUID, credits int, note string) error {
	if credits <= 0 {
		return apperr.BadRequest("补偿积分需大于 0")
	}
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperr.NotFound("工作台不存在")
		}
		return apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	end, err := s.quota.CurrentCycleEnd(ctx, wsID)
	if err != nil {
		return err
	}
	grant := model.BonusCreditGrant{
		WorkspaceID: wsID,
		UserID:      ws.OwnerID,
		Credits:     credits,
		Source:      model.BonusSourceAdminGrant,
		ExpiresAt:   end,
	}
	if err := s.db.WithContext(ctx).Create(&grant).Error; err != nil {
		return apperr.Wrap(apperr.CodeInternal, "补积分失败", err)
	}
	s.audit(ctx, adminID, model.AuditGrantCredits, "workspace", wsID.String(),
		fmt.Sprintf("补 %d 积分(至 %s);%s", credits, end.Format("2006-01-02"), note))
	logger.Info("[admin] 补积分", logger.String("ws", wsID.String()), logger.Int("credits", credits))
	return nil
}

// SetPlan 手动改工作台方案(客服开通/延长,不计佣)。plan=FREE 即降级并清有效期。
// 付费:同档未过期则从到期日顺延(锚点不变),否则从现在起算并重置锚点 —— 与真实支付升级口径一致。
func (s *AdminService) SetPlan(ctx context.Context, adminID, wsID uuid.UUID, plan string, months int, note string) error {
	if plan != model.PlanFree && plan != model.PlanPro && plan != model.PlanTeam {
		return apperr.BadRequest("方案非法")
	}
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperr.NotFound("工作台不存在")
		}
		return apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	updates := map[string]any{"plan": plan}
	detail := ""
	if plan == model.PlanFree {
		updates["plan_expires_at"] = nil
		updates["billing_cycle_anchor"] = nil
		detail = fmt.Sprintf("%s → FREE;%s", ws.Plan, note)
	} else {
		if months <= 0 {
			months = 1
		}
		now := time.Now()
		base, anchor := now, now
		if ws.Plan == plan && ws.PlanExpiresAt != nil && ws.PlanExpiresAt.After(now) {
			base = *ws.PlanExpiresAt
			if ws.BillingCycleAnchor != nil {
				anchor = *ws.BillingCycleAnchor
			}
		}
		expires := base.AddDate(0, months, 0)
		updates["plan_expires_at"] = expires
		updates["billing_cycle_anchor"] = anchor
		detail = fmt.Sprintf("%s → %s ×%d月(至 %s);%s", ws.Plan, plan, months, expires.Format("2006-01-02"), note)
	}
	if err := s.db.WithContext(ctx).Model(&model.Workspace{}).Where("id = ?", wsID).Updates(updates).Error; err != nil {
		return apperr.Wrap(apperr.CodeInternal, "改方案失败", err)
	}
	s.audit(ctx, adminID, model.AuditSetPlan, "workspace", wsID.String(), detail)
	logger.Info("[admin] 手动改方案", logger.String("ws", wsID.String()), logger.String("plan", plan))
	return nil
}

// —— Phase 3:订单 / 账单运维(薄封装 billing + 审计) ————————————————————

func (s *AdminService) ListOrders(ctx context.Context, status string, page int) ([]model.PaymentOrder, int64, int, error) {
	if page < 1 {
		page = 1
	}
	orders, total, err := s.billing.AdminListOrders(ctx, status, adminPageSize, (page-1)*adminPageSize)
	return orders, total, page, err
}

func (s *AdminService) ConfirmOrder(ctx context.Context, adminID, orderID uuid.UUID) (*model.PaymentOrder, error) {
	o, err := s.billing.AdminConfirmOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, adminID, model.AuditOrderConfirm, "order", orderID.String(),
		fmt.Sprintf("确认收款 %s ×%d月 ¥%.2f", o.Plan, o.PeriodMonths, float64(o.AmountCents)/100))
	return o, nil
}

func (s *AdminService) RefundOrder(ctx context.Context, adminID, orderID uuid.UUID, note string) (*model.PaymentOrder, error) {
	o, err := s.billing.AdminRefundOrder(ctx, orderID, note)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, adminID, model.AuditOrderRefund, "order", orderID.String(),
		fmt.Sprintf("退款 ¥%.2f;%s", float64(o.AmountCents)/100, note))
	return o, nil
}

func (s *AdminService) ListOverflowBills(ctx context.Context, status string, page int) ([]model.OverflowBill, int64, int, error) {
	if page < 1 {
		page = 1
	}
	bills, total, err := s.billing.AdminListOverflowBills(ctx, status, adminPageSize, (page-1)*adminPageSize)
	return bills, total, page, err
}

func (s *AdminService) SettleOverflowBill(ctx context.Context, adminID, billID uuid.UUID, note string) (*model.OverflowBill, error) {
	b, err := s.billing.AdminSettleOverflow(ctx, billID, note)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, adminID, model.AuditOverflowSettle, "overflow_bill", billID.String(),
		fmt.Sprintf("核销 ¥%.2f;%s", float64(b.AmountCents)/100, note))
	return b, nil
}

// —— 代理商写操作(薄封装 agency + 审计,读操作仍直接走 AgencyService) ——————————

func (s *AdminService) CreateAgency(ctx context.Context, adminID uuid.UUID, phone string, bp int, note string) (*model.Agency, error) {
	ag, err := s.agency.AdminCreate(ctx, phone, bp, note)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, adminID, model.AuditAgencyCreate, "agency", ag.ID.String(),
		fmt.Sprintf("开通代理 %s(佣金 %.1f%%)", phone, float64(ag.CommissionBP)/100))
	return ag, nil
}

func (s *AdminService) UpdateAgency(ctx context.Context, adminID, agencyID uuid.UUID, bp int, status string) (*model.Agency, error) {
	ag, err := s.agency.AdminUpdate(ctx, agencyID, bp, status)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, adminID, model.AuditAgencyUpdate, "agency", agencyID.String(),
		fmt.Sprintf("佣金=%.1f%% 状态=%s", float64(ag.CommissionBP)/100, ag.Status))
	return ag, nil
}

func (s *AdminService) ReviewWithdrawal(ctx context.Context, adminID, withdrawalID uuid.UUID, approve bool, note string) (*model.AgencyWithdrawal, error) {
	w, err := s.agency.AdminReviewWithdrawal(ctx, withdrawalID, adminID, approve, note)
	if err != nil {
		return nil, err
	}
	verb := "驳回"
	if approve {
		verb = "通过打款"
	}
	s.audit(ctx, adminID, model.AuditWithdrawalReview, "withdrawal", withdrawalID.String(),
		fmt.Sprintf("%s ¥%.2f;%s", verb, float64(w.AmountCents)/100, note))
	return w, nil
}

// —— Phase 4:审计日志 ————————————————————————————————————————————

type AuditLogRow struct {
	Log        model.AdminAuditLog `json:"log"`
	AdminPhone string              `json:"adminPhone"`
}

// ListAuditLogs 审计日志分页(action 空=全部;新在前)。附操作管理员手机号。
func (s *AdminService) ListAuditLogs(ctx context.Context, action string, page int) ([]AuditLogRow, int64, int, error) {
	if page < 1 {
		page = 1
	}
	q := s.db.WithContext(ctx).Model(&model.AdminAuditLog{})
	if action != "" {
		q = q.Where("action = ?", action)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, page, apperr.Wrap(apperr.CodeInternal, "统计审计日志失败", err)
	}
	var logs []model.AdminAuditLog
	if err := q.Order("created_at DESC").
		Limit(adminPageSize).Offset((page - 1) * adminPageSize).Find(&logs).Error; err != nil {
		return nil, 0, page, apperr.Wrap(apperr.CodeInternal, "查询审计日志失败", err)
	}
	// 补操作人手机号(小页,逐行查可接受)。
	phones := map[uuid.UUID]string{}
	rows := make([]AuditLogRow, 0, len(logs))
	for _, l := range logs {
		phone, ok := phones[l.AdminID]
		if !ok {
			var u model.User
			if s.db.WithContext(ctx).Select("phone").First(&u, "id = ?", l.AdminID).Error == nil && u.Phone != nil {
				phone = *u.Phone
			}
			phones[l.AdminID] = phone
		}
		rows = append(rows, AuditLogRow{Log: l, AdminPhone: phone})
	}
	return rows, total, page, nil
}
