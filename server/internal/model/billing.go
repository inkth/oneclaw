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

// 用量统一计入「积分池」:每个动作按权重扣不同积分(出片贵、出图便宜),
// 方案按月给一笔积分额度。权重/额度集中在此,调价只改这里。

// usageCreditCost 各动作的积分单价(按 kind)。权重按真实边际成本标定:
// 文本近乎零成本(定低促活),出片含视频生成+脚本+封面+转存,是成本大头。
// 复盘不走派活入口(见 agent.go validAgents),不计积分。
var usageCreditCost = map[string]int{
	UsageAgentTask: 3,   // 选品 / 短视频脚本 / Listing / 试穿(各一次派活)
	UsageVideo:     175, // 出片(短视频):覆盖单条 ~¥4 生成成本 + ~30% 毛利
	UsageImage:     6,   // 出图(每张):覆盖图像生成成本
}

// planCredits 各档方案的月度积分额度。-1 表示不限(TEAM,超基线部分按量计费)。
// 按 ¥0.0332/积分(PRO ¥199/6000)标定,出片 175 积分/条 → FREE≈2 条、PRO≈34 条出片。
var planCredits = map[string]int{
	PlanFree: 450,
	PlanPro:  6000,
	PlanTeam: -1,
}

// TeamBaselineCredits TEAM 月度含量基线;本月用量超出后,超出部分标记为待结算(billable),
// 不阻断出片。含 ≈171 条出片(30000/175),覆盖 ¥899 月费且留毛利。
const TeamBaselineCredits = 30000

// TeamOverflowCentsPerKCredit TEAM 超基线用量结算单价:分/千积分(¥45/千积分≈¥0.045/积分,
// 出片 ≈¥7.9/条,成本上加 ~40% 便利溢价)。供月底对账/出账单用。
const TeamOverflowCentsPerKCredit = 4500

// CreditsFor 返回某动作消耗的积分(qty 张/条/次)。未知 kind 记 0。
func CreditsFor(kind string, qty int) int {
	return usageCreditCost[kind] * qty
}

// PlanCredits 返回方案月度积分额度;未知方案按 FREE 处理。-1 不限。
func PlanCredits(plan string) int {
	if c, ok := planCredits[plan]; ok {
		return c
	}
	return planCredits[PlanFree]
}

// CreditCosts 返回积分单价表(前端动作处标识用)。
func CreditCosts() map[string]int {
	return map[string]int{
		"agentTask": usageCreditCost[UsageAgentTask],
		"video":     usageCreditCost[UsageVideo],
		"image":     usageCreditCost[UsageImage],
	}
}

// UsageRecord 一笔配额消耗(月度窗口内求和与配额比较)。
// RefID 指向消耗来源(AgentTask/Video ID),终态失败时按 ref 退回。
type UsageRecord struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index:idx_usage_ws_kind_created" json:"workspaceId"`
	Kind        string     `gorm:"not null;index:idx_usage_ws_kind_created" json:"kind"`
	Qty         int        `gorm:"not null;default:1" json:"qty"`
	RefID       *uuid.UUID `gorm:"column:ref_id;type:uuid;index" json:"refId,omitempty"`
	Billable    bool       `gorm:"not null;default:false;index" json:"billable"` // TEAM 超基线的待结算用量
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
