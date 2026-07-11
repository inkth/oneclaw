package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
)

// BillingService 订阅下单与订单状态。
// 微信/支付宝商户凭证未接入前走 mock 渠道:二维码为占位,dev 模式可 mock-confirm 闭环;
// 真实渠道接入时在 createQRCode 按 provider 分发即可,订单/升级逻辑不变。
type BillingService struct {
	db     *gorm.DB
	dev    bool
	agency *AgencyService
	// commissionOnMock 仅 dev 生效:是否让 mock 支付也计佣(联调计佣链路用)。
	commissionOnMock bool
}

func NewBillingService(db *gorm.DB, dev bool, agency *AgencyService, commissionOnMock bool) *BillingService {
	return &BillingService{db: db, dev: dev, agency: agency, commissionOnMock: commissionOnMock}
}

// shouldCommission 是否为这笔付费计佣:真实付费恒计;mock 付费仅 dev+开关时计(默认 mock 不计)。
func (s *BillingService) shouldCommission(isMock bool) bool {
	if !isMock {
		return true
	}
	return s.dev && s.commissionOnMock
}

// 月度价目(分)。周期折扣:3 个月 9 折,12 个月 7.5 折。与 /pricing 页一致。
var planMonthlyCents = map[string]int{
	model.PlanPro:  19900,
	model.PlanTeam: 89900,
}

func priceCents(plan string, months int) (int, error) {
	monthly, ok := planMonthlyCents[plan]
	if !ok {
		return 0, apperr.BadRequest("不支持的方案")
	}
	switch months {
	case 1:
		return monthly, nil
	case 3:
		return int(float64(monthly)*2.7 + 0.5), nil
	case 12:
		return monthly * 9, nil
	default:
		return 0, apperr.BadRequest("订阅周期仅支持 1/3/12 个月")
	}
}

const orderTTL = 15 * time.Minute

type CheckoutInput struct {
	Plan         string `json:"plan" binding:"required,oneof=PRO TEAM"`
	PeriodMonths int    `json:"periodMonths" binding:"required"`
	Provider     string `json:"provider" binding:"required,oneof=WECHAT ALIPAY"`
}

// Checkout 生成支付订单 + 二维码内容。
func (s *BillingService) Checkout(ctx context.Context, wsID, userID uuid.UUID, in CheckoutInput) (*model.PaymentOrder, error) {
	// 生产环境真实渠道未接入时直接拒单:不能给用户一个永远支付不了的 mock 二维码。
	if !s.dev {
		return nil, apperr.New(apperr.CodeServiceUnavailable, "支付渠道接入中,暂未开放线上购买,请联系客服开通")
	}
	amount, err := priceCents(in.Plan, in.PeriodMonths)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	o := model.PaymentOrder{
		WorkspaceID:  wsID,
		UserID:       userID,
		OutTradeNo:   newOutTradeNo(now),
		Plan:         in.Plan,
		PeriodMonths: in.PeriodMonths,
		AmountCents:  amount,
		Provider:     in.Provider,
		Status:       model.OrderPending,
		ExpiresAt:    now.Add(orderTTL),
	}
	o.QRCodeURL, o.IsMock = s.createQRCode(&o)
	if err := s.db.WithContext(ctx).Create(&o).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建订单失败", err)
	}
	logger.Info("[billing] 订单创建",
		logger.String("ws", wsID.String()), logger.String("no", o.OutTradeNo),
		logger.String("plan", o.Plan), logger.String("provider", o.Provider))
	return &o, nil
}

// createQRCode 生成扫码内容。真实商户凭证未配置 → mock 占位(IsMock=true,前端提示并在 dev 提供模拟支付)。
// TODO(P4-live): 接微信 Native 下单 / 支付宝当面付,返回 code_url。
func (s *BillingService) createQRCode(o *model.PaymentOrder) (string, bool) {
	return "oneclaw://mock-pay/" + o.OutTradeNo, true
}

// GetOrder 查单(自动把过期 PENDING 翻成 EXPIRED)。
func (s *BillingService) GetOrder(ctx context.Context, wsID, orderID uuid.UUID) (*model.PaymentOrder, error) {
	var o model.PaymentOrder
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", orderID, wsID).First(&o).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("订单不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询订单失败", err)
	}
	if o.Status == model.OrderPending && time.Now().After(o.ExpiresAt) {
		s.db.WithContext(ctx).Model(&o).Update("status", model.OrderExpired)
		o.Status = model.OrderExpired
	}
	return &o, nil
}

// MockConfirm 模拟支付成功(仅 dev 模式 + mock 订单),用于无商户凭证时联调整条升级链路。
func (s *BillingService) MockConfirm(ctx context.Context, wsID, orderID uuid.UUID) (*model.PaymentOrder, error) {
	if !s.dev {
		return nil, apperr.Forbidden("mock 支付仅在开发模式可用")
	}
	o, err := s.GetOrder(ctx, wsID, orderID)
	if err != nil {
		return nil, err
	}
	if !o.IsMock {
		return nil, apperr.BadRequest("非 mock 订单不能模拟支付")
	}
	if err := s.markPaid(ctx, o); err != nil {
		return nil, err
	}
	return o, nil
}

// markPaid 落支付成功 + 升级工作台方案(事务,幂等:仅 PENDING 单生效)。
func (s *BillingService) markPaid(ctx context.Context, o *model.PaymentOrder) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		res := tx.Model(&model.PaymentOrder{}).
			Where("id = ? AND status = ?", o.ID, model.OrderPending).
			Updates(map[string]any{"status": model.OrderPaid, "paid_at": now})
		if res.Error != nil {
			return apperr.Wrap(apperr.CodeInternal, "更新订单失败", res.Error)
		}
		if res.RowsAffected == 0 {
			return apperr.BadRequest("订单已处理或已过期")
		}

		var ws model.Workspace
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&ws, "id = ?", o.WorkspaceID).Error; err != nil {
			return apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
		}
		// 续费同方案从现有到期日顺延、计费周期锚点不变;换方案/已到期从现在起算并重置锚点。
		base := now
		anchor := now
		if ws.Plan == o.Plan && ws.PlanExpiresAt != nil && ws.PlanExpiresAt.After(now) {
			base = *ws.PlanExpiresAt
			if ws.BillingCycleAnchor != nil {
				anchor = *ws.BillingCycleAnchor
			}
		}
		expires := base.AddDate(0, o.PeriodMonths, 0)
		if err := tx.Model(&model.Workspace{}).Where("id = ?", ws.ID).
			Updates(map[string]any{"plan": o.Plan, "plan_expires_at": expires, "billing_cycle_anchor": anchor}).Error; err != nil {
			return apperr.Wrap(apperr.CodeInternal, "升级方案失败", err)
		}
		// 代理商归因计佣(同事务,佣金与订单状态原子一致;无归因/mock 不计佣时静默跳过)。
		if s.agency != nil && s.shouldCommission(o.IsMock) {
			if err := s.agency.RecordCommissionTx(tx, model.CommissionSourceOrder, o.ID, o.UserID, o.AmountCents); err != nil {
				return apperr.Wrap(apperr.CodeInternal, "计佣失败", err)
			}
		}
		o.Status = model.OrderPaid
		o.PaidAt = &now
		logger.Info("[billing] 支付成功,方案已升级",
			logger.String("ws", ws.ID.String()), logger.String("plan", o.Plan),
			logger.String("expires", expires.Format(time.RFC3339)))
		return nil
	})
}

func newOutTradeNo(now time.Time) string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return fmt.Sprintf("OC%s%s", now.Format("20060102150405"), hex.EncodeToString(b))
}

// —— 管理侧:全站订单 / 账单运维 ————————————————————————————————————
//
// 真实支付渠道未接入前,线上购买被 Checkout 拒单;付费经线下转账完成,由管理员在后台
// 人工确认收款(AdminConfirmOrder)触发升级 + 计佣。退款同理走线下,后台仅记录状态 + 审计。

// AdminListOrders 全站订单分页(status 空=全部;新单在前)。返回本页 + 总数。
func (s *BillingService) AdminListOrders(ctx context.Context, status string, limit, offset int) ([]model.PaymentOrder, int64, error) {
	q := s.db.WithContext(ctx).Model(&model.PaymentOrder{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, apperr.Wrap(apperr.CodeInternal, "统计订单失败", err)
	}
	var orders []model.PaymentOrder
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&orders).Error; err != nil {
		return nil, 0, apperr.Wrap(apperr.CodeInternal, "查询订单失败", err)
	}
	return orders, total, nil
}

// AdminConfirmOrder 人工确认线下收款:按订单 ID 落支付成功 + 升级方案 + 计佣(复用 markPaid,幂等)。
// 不校验 workspace(管理端全站),不受 dev 限制(真实线下收款在生产也要能确认)。
func (s *BillingService) AdminConfirmOrder(ctx context.Context, orderID uuid.UUID) (*model.PaymentOrder, error) {
	var o model.PaymentOrder
	if err := s.db.WithContext(ctx).First(&o, "id = ?", orderID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("订单不存在")
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "查询订单失败", err)
	}
	if err := s.markPaid(ctx, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

// AdminRefundOrder 标记退款(仅 PAID 单可退):真实退款走线下,后台记录状态 + 备注。
// 不自动降级方案 / 不冲销佣金(避免自动误伤);如需一并降级由管理员另用 SetPlan 处理。
func (s *BillingService) AdminRefundOrder(ctx context.Context, orderID uuid.UUID, note string) (*model.PaymentOrder, error) {
	res := s.db.WithContext(ctx).Model(&model.PaymentOrder{}).
		Where("id = ? AND status = ?", orderID, model.OrderPaid).
		Updates(map[string]any{"status": model.OrderRefunded})
	if res.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "标记退款失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperr.BadRequest("订单不存在或非已支付状态,无法退款")
	}
	var o model.PaymentOrder
	if err := s.db.WithContext(ctx).First(&o, "id = ?", orderID).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询订单失败", err)
	}
	logger.Info("[billing] 订单已标记退款", logger.String("order", orderID.String()), logger.String("note", note))
	return &o, nil
}

// AdminListOverflowBills 全站超额账单分页(status 空=全部;PENDING 在前,再按账期倒序)。
func (s *BillingService) AdminListOverflowBills(ctx context.Context, status string, limit, offset int) ([]model.OverflowBill, int64, error) {
	q := s.db.WithContext(ctx).Model(&model.OverflowBill{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, apperr.Wrap(apperr.CodeInternal, "统计超额账单失败", err)
	}
	var bills []model.OverflowBill
	if err := q.Order("CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, period DESC").
		Limit(limit).Offset(offset).Find(&bills).Error; err != nil {
		return nil, 0, apperr.Wrap(apperr.CodeInternal, "查询超额账单失败", err)
	}
	return bills, total, nil
}

// AdminSettleOverflow 人工核销超额账单:按账单 ID 查出所属工作台后标记已结算(复用 MarkOverflowPaid,幂等+计佣)。
func (s *BillingService) AdminSettleOverflow(ctx context.Context, billID uuid.UUID, note string) (*model.OverflowBill, error) {
	var bill model.OverflowBill
	if err := s.db.WithContext(ctx).Select("workspace_id").First(&bill, "id = ?", billID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("账单不存在")
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "查询超额账单失败", err)
	}
	return s.MarkOverflowPaid(ctx, bill.WorkspaceID, billID, note)
}

// —— TEAM 超额周期结算 ————————————————————————————————————————————
//
// job 把每个工作台「刚结束的订阅周期」内 billable=true 的用量出账。billable 仅在 TEAM
// (不限额)本周期超 TeamBaselineCredits 后由 quota.CheckAndRecord 置位,故按 billable 聚合即为
// 应结算用量。账期按各工作台自己的订阅周期(anniversary)切,不是自然月。

// SettleDueCycles 扫描所有有待结算(billable)用量的工作台,为各自「刚结束的上一订阅周期」出账。
// 幂等(账单按 workspace_id+period 唯一):已出账的周期重复跑只空转。返回本次新生成的账单数。
func (s *BillingService) SettleDueCycles(ctx context.Context, now time.Time) (int, error) {
	var wsIDs []uuid.UUID
	if err := s.db.WithContext(ctx).Model(&model.UsageRecord{}).
		Where("billable = ?", true).
		Distinct().Pluck("workspace_id", &wsIDs).Error; err != nil {
		return 0, apperr.Wrap(apperr.CodeInternal, "扫描待结算工作台失败", err)
	}
	created := 0
	for _, wsID := range wsIDs {
		n, err := s.settleWorkspacePrevCycle(ctx, wsID, now)
		if err != nil {
			logger.Warn("[settle] 工作台出账失败", logger.String("ws", wsID.String()), logger.Err(err))
			continue
		}
		created += n
	}
	return created, nil
}

// settleWorkspacePrevCycle 为单个工作台「上一个已结束订阅周期」出账(幂等)。返回新生成账单数(0/1)。
func (s *BillingService) settleWorkspacePrevCycle(ctx context.Context, wsID uuid.UUID, now time.Time) (int, error) {
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", wsID).Error; err != nil {
		return 0, apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	// 结算锚点恒用付费日(BillingCycleAnchor,回退注册日),与当前 plan 无关:
	// 中途降级的 TEAM 其历史 billable 仍按原付费周期结清(降级后 FREE 不再产生新 billable)。
	anchor := ws.CreatedAt
	if ws.BillingCycleAnchor != nil {
		anchor = *ws.BillingCycleAnchor
	}
	// 上一周期 = 当前周期起点往前一个订阅月,右开界 = 当前周期起点(必 ≤ now,即已结束)。
	curStart, _ := cycleBounds(anchor, now)
	py, pm := shiftMonth(curStart.Year(), curStart.Month(), -1)
	prevStart := anchorInMonth(py, pm, anchor.In(cnZone).Day())
	prevEnd := curStart
	period := prevStart.Format("2006-01-02")

	type row struct {
		Kind string
		Cnt  int
	}
	var rows []row
	if err := s.db.WithContext(ctx).Model(&model.UsageRecord{}).
		Select("kind, COALESCE(SUM(qty),0) AS cnt").
		Where("workspace_id = ? AND billable = ? AND created_at >= ? AND created_at < ?", wsID, true, prevStart, prevEnd).
		Group("kind").Scan(&rows).Error; err != nil {
		return 0, apperr.Wrap(apperr.CodeInternal, "汇总超额用量失败", err)
	}
	credits := 0
	for _, r := range rows {
		credits += model.CreditsFor(r.Kind, r.Cnt)
	}
	if credits <= 0 {
		return 0, nil
	}

	bill := model.OverflowBill{
		WorkspaceID:     wsID,
		Period:          period,
		PeriodStart:     prevStart,
		PeriodEnd:       prevEnd,
		BillableCredits: credits,
		AmountCents:     model.OverflowCents(credits),
		Status:          model.OverflowPending,
		OutTradeNo:      newOutTradeNo(now),
	}
	// (workspace_id, period) 唯一 + ON CONFLICT DO NOTHING:同周期重复跑不会重复出账。
	res := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&bill)
	if res.Error != nil {
		return 0, apperr.Wrap(apperr.CodeInternal, "生成超额账单失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return 0, nil // 该周期已出账,幂等跳过
	}
	// MVP:无代扣渠道,落一条醒目日志通知销售人工对账(后续接微信/支付宝代扣回调 → MarkOverflowPaid)。
	logger.Info("[settle] TEAM 超额账单已生成,待对账/代扣",
		logger.String("ws", wsID.String()),
		logger.String("period", period),
		logger.String("cycle", prevStart.Format("2006-01-02")+"~"+prevEnd.Format("2006-01-02")),
		logger.Int("billableCredits", credits),
		logger.Int("amountCents", bill.AmountCents),
		logger.String("outTradeNo", bill.OutTradeNo))
	return 1, nil
}

// MockSettleOverflow 模拟超额账单结算(仅 dev),无代扣渠道时联调「出账→结清」闭环。
func (s *BillingService) MockSettleOverflow(ctx context.Context, wsID, billID uuid.UUID) (*model.OverflowBill, error) {
	if !s.dev {
		return nil, apperr.Forbidden("mock 结算仅在开发模式可用")
	}
	return s.MarkOverflowPaid(ctx, wsID, billID, "dev mock settle")
}

// ListOverflowBills 列出某工作台的超额账单(新账期在前),供 settings 页/对账查看。
func (s *BillingService) ListOverflowBills(ctx context.Context, wsID uuid.UUID) ([]model.OverflowBill, error) {
	var bills []model.OverflowBill
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("period DESC").Find(&bills).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询超额账单失败", err)
	}
	return bills, nil
}

// MarkOverflowPaid 把一笔超额账单标记为已结算(幂等:仅 PENDING 单生效)。
// 接入微信/支付宝代扣后由支付回调调用;MVP 阶段供 dev 联调与人工核销入口复用。
// 结算成功时按 workspace owner 归因计佣(OverflowBill 无 UserID,TEAM 付费主体=owner)。
func (s *BillingService) MarkOverflowPaid(ctx context.Context, wsID, billID uuid.UUID, note string) (*model.OverflowBill, error) {
	now := time.Now()
	var bill model.OverflowBill
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&model.OverflowBill{}).
			Where("id = ? AND workspace_id = ? AND status = ?", billID, wsID, model.OverflowPending).
			Updates(map[string]any{"status": model.OverflowPaid, "paid_at": now, "note": note})
		if res.Error != nil {
			return apperr.Wrap(apperr.CodeInternal, "更新超额账单失败", res.Error)
		}
		if res.RowsAffected == 0 {
			return apperr.BadRequest("账单不存在或已结算")
		}
		if err := tx.First(&bill, "id = ?", billID).Error; err != nil {
			return apperr.Wrap(apperr.CodeInternal, "查询超额账单失败", err)
		}
		// 超额账单无 IsMock 字段:dev 下的结算(MockSettleOverflow)视为 mock,由开关决定计佣;
		// 生产由真实核销/代扣触发,恒计佣。故用 s.dev 作为「是否 mock」。
		if s.agency != nil && s.shouldCommission(s.dev) {
			var ws model.Workspace
			if err := tx.Select("owner_id").First(&ws, "id = ?", wsID).Error; err != nil {
				return apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
			}
			if err := s.agency.RecordCommissionTx(tx, model.CommissionSourceOverflow, bill.ID, ws.OwnerID, bill.AmountCents); err != nil {
				return apperr.Wrap(apperr.CodeInternal, "计佣失败", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	logger.Info("[settle] 超额账单已结算",
		logger.String("ws", wsID.String()), logger.String("period", bill.Period),
		logger.Int("amountCents", bill.AmountCents))
	return &bill, nil
}
