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
	db  *gorm.DB
	dev bool
}

func NewBillingService(db *gorm.DB, dev bool) *BillingService {
	return &BillingService{db: db, dev: dev}
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
		// 续费同方案从现有到期日顺延;换方案/已到期从现在起算。
		base := now
		if ws.Plan == o.Plan && ws.PlanExpiresAt != nil && ws.PlanExpiresAt.After(now) {
			base = *ws.PlanExpiresAt
		}
		expires := base.AddDate(0, o.PeriodMonths, 0)
		if err := tx.Model(&model.Workspace{}).Where("id = ?", ws.ID).
			Updates(map[string]any{"plan": o.Plan, "plan_expires_at": expires}).Error; err != nil {
			return apperr.Wrap(apperr.CodeInternal, "升级方案失败", err)
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
