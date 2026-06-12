package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 用量类型(usage_records.kind)。
const (
	UsageAgentTask = "AGENT_TASK"
	UsageVideo     = "VIDEO"
	UsageImage     = "IMAGE"
)

// 支付订单状态。
const (
	OrderPending   = "PENDING"
	OrderPaid      = "PAID"
	OrderExpired   = "EXPIRED"
	OrderCancelled = "CANCELLED"
)

// 支付渠道。
const (
	PayWechat = "WECHAT"
	PayAlipay = "ALIPAY"
)

// PlanQuota 各档方案的月度配额。-1 表示不限。
type PlanQuota struct {
	AgentTasks int `json:"agentTasks"`
	Videos     int `json:"videos"`
	Images     int `json:"images"`
}

// planQuotas 与 /pricing 页文案对齐:FREE 10 任务/4 视频,PRO 200 任务/80 视频,TEAM 不限。
var planQuotas = map[string]PlanQuota{
	PlanFree: {AgentTasks: 10, Videos: 4, Images: 12},
	PlanPro:  {AgentTasks: 200, Videos: 80, Images: 240},
	PlanTeam: {AgentTasks: -1, Videos: -1, Images: -1},
}

// QuotaFor 返回方案配额;未知方案按 FREE 处理。
func QuotaFor(plan string) PlanQuota {
	if q, ok := planQuotas[plan]; ok {
		return q
	}
	return planQuotas[PlanFree]
}

// UsageRecord 一笔配额消耗(月度窗口内求和与配额比较)。
// RefID 指向消耗来源(AgentTask/Video ID),终态失败时按 ref 退回。
type UsageRecord struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index:idx_usage_ws_kind_created" json:"workspaceId"`
	Kind        string     `gorm:"not null;index:idx_usage_ws_kind_created" json:"kind"`
	Qty         int        `gorm:"not null;default:1" json:"qty"`
	RefID       *uuid.UUID `gorm:"column:ref_id;type:uuid;index" json:"refId,omitempty"`
	CreatedAt   time.Time  `gorm:"index:idx_usage_ws_kind_created" json:"createdAt"`
}

func (u *UsageRecord) BeforeCreate(*gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// PaymentOrder 订阅支付订单。status: PENDING→PAID/EXPIRED/CANCELLED。
// 渠道凭证未配置时 qr_code_url 为 mock 占位,dev 模式可走 mock-confirm 闭环联调。
type PaymentOrder struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID  uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index" json:"workspaceId"`
	UserID       uuid.UUID  `gorm:"column:user_id;type:uuid;not null" json:"userId"`
	OutTradeNo   string     `gorm:"column:out_trade_no;uniqueIndex;not null" json:"outTradeNo"`
	Plan         string     `gorm:"not null" json:"plan"`
	PeriodMonths int        `gorm:"column:period_months;not null" json:"periodMonths"`
	AmountCents  int        `gorm:"column:amount_cents;not null" json:"amountCents"`
	Provider     string     `gorm:"not null" json:"provider"`
	Status       string     `gorm:"not null;default:'PENDING';index" json:"status"`
	QRCodeURL    string     `gorm:"column:qr_code_url;type:text" json:"qrCodeUrl"`
	IsMock       bool       `gorm:"column:is_mock;default:false" json:"isMock"`
	PaidAt       *time.Time `json:"paidAt,omitempty"`
	ExpiresAt    time.Time  `json:"expiresAt"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

func (o *PaymentOrder) BeforeCreate(*gorm.DB) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	return nil
}
