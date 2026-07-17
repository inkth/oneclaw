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

// 支付订单状态。REFUNDED = 已付款后由管理员标记退款(线下退,后台仅记录状态 + 审计)。
const (
	OrderPending   = "PENDING"
	OrderPaid      = "PAID"
	OrderExpired   = "EXPIRED"
	OrderCancelled = "CANCELLED"
	OrderRefunded  = "REFUNDED"
)

// TEAM 超额账单状态:出账即 PENDING,代扣成功 / 人工核销后 PAID。
const (
	OverflowPending = "PENDING"
	OverflowPaid    = "PAID"
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
// 复盘的本地四象限诊断免费,仅「AI 深挖」(gemini-3.5-flash)按一次 AGENT_TASK 计费(见 agent_review.go)。
var usageCreditCost = map[string]int{
	UsageAgentTask: 3,  // 选品 / 短视频脚本 / Listing / 试穿 / 复盘 AI 深挖(各一次)
	UsageImage:     6,  // 出图(每张):覆盖图像生成成本
	UsageVideo:     35, // 出片(短视频)**每秒**:2026-07-17 生产实测成本 ≈12.1¢/s(¥0.87/s),35 积分/s(¥1.16)≈33% 毛利
}

// 出片按秒计费(qty=AI 生成秒数,4-15s;实拍开场拼接不耗模型、不计秒):
// 旧的 175 积分/条固定价基于「¥4/条」假设,只对 4-5s 成立 —— 生产主流 12s 单条成本 ¥10.4,
// 平均每条倒亏 ~¥3.6,故改按秒。8s(默认)=280 积分 ≈¥9.3、12s=420、15s=525。

// planCredits 各档方案的月度积分额度。-1 表示不限(TEAM,超基线部分按量计费)。
// 按 ¥0.0332/积分(PRO ¥199/6000)标定,8s 出片 280 积分 → FREE≈1 条、PRO≈21 条出片。
var planCredits = map[string]int{
	PlanFree: 450,
	PlanPro:  6000,
	PlanTeam: -1,
}

// TeamBaselineCredits TEAM 月度含量基线;本月用量超出后,超出部分标记为待结算(billable),
// 不阻断出片。含 ≈107 条 8s 出片(30000/280),覆盖 ¥899 月费且留毛利。
const TeamBaselineCredits = 30000

// TeamOverflowCentsPerKCredit TEAM 超基线用量结算单价:分/千积分(¥45/千积分≈¥0.045/积分,
// 8s 出片 ≈¥12.6/条,成本上加 ~35% 便利溢价)。供月底对账/出账单用。
const TeamOverflowCentsPerKCredit = 4500

// CreditsFor 返回某动作消耗的积分(qty 张/条/次)。未知 kind 记 0。
func CreditsFor(kind string, qty int) int {
	return usageCreditCost[kind] * qty
}

// OverflowCents 把 TEAM 超基线积分折算为结算金额(分)。
// 周期出账(SettleDueCycles)与用量预览(Usage)共用,避免两处口径漂移。
func OverflowCents(billableCredits int) int {
	return billableCredits * TeamOverflowCentsPerKCredit / 1000
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

// OverflowBill TEAM 超基线用量的订阅周期结算账单。结算 job(SettleDueCycles)汇总刚结束的
// 订阅周期内 billable=true 的用量积分,按 TeamOverflowCentsPerKCredit 折算成金额出账,状态待结算。
// (workspace_id, period) 唯一 —— 同一周期不重复出账(幂等);Period 为该周期起点 YYYY-MM-DD(中国时区)。
type OverflowBill struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID     uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;uniqueIndex:uq_overflow_ws_period,priority:1" json:"workspaceId"`
	Period          string     `gorm:"not null;uniqueIndex:uq_overflow_ws_period,priority:2" json:"period"` // 账期=订阅周期起点 YYYY-MM-DD(中国时区)
	PeriodStart     time.Time  `gorm:"column:period_start;not null" json:"periodStart"`
	PeriodEnd       time.Time  `gorm:"column:period_end;not null" json:"periodEnd"` // 开区间上界(下一周期起点)
	BillableCredits int        `gorm:"column:billable_credits;not null" json:"billableCredits"`
	AmountCents     int        `gorm:"column:amount_cents;not null" json:"amountCents"`
	Status          string     `gorm:"not null;default:'PENDING';index" json:"status"`
	OutTradeNo      string     `gorm:"column:out_trade_no;uniqueIndex;not null" json:"outTradeNo"`
	PaidAt          *time.Time `json:"paidAt,omitempty"`
	Note            string     `gorm:"type:text" json:"note,omitempty"` // 人工对账备注(谁/何时/凭证)
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

func (b *OverflowBill) BeforeCreate(*gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}
