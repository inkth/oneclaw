package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 代理商状态。DISABLED 后邀请码失效、停止对新付费计佣(已有归因/佣金保留)。
const (
	AgencyActive   = "ACTIVE"
	AgencyDisabled = "DISABLED"
)

// 提现申请状态。PENDING→PAID(审核通过=已线下打款)/REJECTED(驳回,占用余额释放)。
const (
	WithdrawalPending  = "PENDING"
	WithdrawalPaid     = "PAID"
	WithdrawalRejected = "REJECTED"
)

// 佣金流水来源类型(commission_records.source_type)。
const (
	CommissionSourceOrder    = "PAYMENT_ORDER"
	CommissionSourceOverflow = "OVERFLOW_BILL"
)

// 赠送积分来源(bonus_credit_grants.source)。
const (
	BonusSourceAgencyInvite = "AGENCY_INVITE"
	BonusSourceAdminGrant   = "ADMIN_GRANT" // 管理员手动补积分(客服补偿)
	ReferralSourceLink      = "LINK"
	ReferralSourceLegacy    = "LEGACY_LINK"
)

// DefaultCommissionBP 佣金比例默认值(万分比,2000=20%);config 未设时兜底。
const DefaultCommissionBP = 2000

// Agency 代理商账户。一个用户至多一个代理身份(user_id 唯一);Code 是整个归因入口。
// 佣金比例用万分比整数(CommissionBP,2000=20%),与项目「分」为单位的整数金额风格一致,
// amount = base*bp/10000 无浮点误差。不存余额字段:余额=佣金流水合计−提现占用(聚合计算,见 service)。
type Agency struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID       uuid.UUID `gorm:"column:user_id;type:uuid;uniqueIndex;not null" json:"userId"`
	Code         string    `gorm:"uniqueIndex;not null" json:"code"`                               // 新代理为 1112-9999 四位数字;历史码继续有效
	CommissionBP int       `gorm:"column:commission_bp;not null;default:2000" json:"commissionBp"` // 佣金比例(万分比)
	Status       string    `gorm:"not null;default:'ACTIVE';index" json:"status"`
	Note         string    `gorm:"type:text" json:"note,omitempty"` // 管理员备注
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (a *Agency) BeforeCreate(*gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// AgencyReferral 归因绑定:新用户经邀请码注册即永久绑定该代理商。
// user_id 唯一索引 = 数据库级「一个用户只绑一次」保证;绑定不可改。
// 归因关系永久保留，但仅注册后一年内的付费可计佣。
type AgencyReferral struct {
	ID                      uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID                  uuid.UUID  `gorm:"column:user_id;type:uuid;uniqueIndex;not null" json:"userId"`
	AgencyID                uuid.UUID  `gorm:"column:agency_id;type:uuid;index;not null" json:"agencyId"`
	ClickID                 *uuid.UUID `gorm:"column:click_id;type:uuid;uniqueIndex" json:"clickId,omitempty"`
	AttributionSource       string     `gorm:"column:attribution_source;not null;default:'LEGACY_LINK'" json:"attributionSource"`
	BonusCredits            int        `gorm:"column:bonus_credits;not null" json:"bonusCredits"` // 赠送积分快照(便于日后调默认值不影响历史)
	CommissionEligibleUntil *time.Time `gorm:"column:commission_eligible_until;index" json:"-"`
	CreatedAt               time.Time  `json:"createdAt"`
}

// AgencyReferralClick 是有效代理链接的一次访问。IP 只保存加盐哈希，
// ConvertedUserID 指向最终使用首触 Cookie 完成注册的用户。
type AgencyReferralClick struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	AgencyID        uuid.UUID  `gorm:"column:agency_id;type:uuid;not null;index:idx_agency_click_created" json:"agencyId"`
	InviteCode      string     `gorm:"column:invite_code;not null;index" json:"inviteCode"`
	LandingPath     string     `gorm:"column:landing_path;not null" json:"landingPath"`
	UTMSource       string     `gorm:"column:utm_source" json:"utmSource,omitempty"`
	UTMMedium       string     `gorm:"column:utm_medium" json:"utmMedium,omitempty"`
	UTMCampaign     string     `gorm:"column:utm_campaign" json:"utmCampaign,omitempty"`
	Referer         string     `gorm:"column:referer" json:"-"`
	UserAgent       string     `gorm:"column:user_agent" json:"-"`
	IPHash          string     `gorm:"column:ip_hash;size:64" json:"-"`
	ConvertedUserID *uuid.UUID `gorm:"column:converted_user_id;type:uuid;index" json:"convertedUserId,omitempty"`
	ConvertedAt     *time.Time `gorm:"column:converted_at" json:"convertedAt,omitempty"`
	CreatedAt       time.Time  `gorm:"index:idx_agency_click_created" json:"createdAt"`
}

func (c *AgencyReferralClick) BeforeCreate(*gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

func (r *AgencyReferral) BeforeCreate(*gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	if r.CreatedAt.IsZero() {
		r.CreatedAt = time.Now()
	}
	if r.CommissionEligibleUntil == nil {
		until := r.CreatedAt.AddDate(1, 0, 0)
		r.CommissionEligibleUntil = &until
	}
	return nil
}

// CommissionEligibleAt 判断付费发生时间是否仍在注册后一年的计佣窗口内。
// 截止时间采用左闭右开边界：[created_at, commission_eligible_until)。
func (r AgencyReferral) CommissionEligibleAt(at time.Time) bool {
	if at.Before(r.CreatedAt) {
		return false
	}
	until := r.CreatedAt.AddDate(1, 0, 0)
	if r.CommissionEligibleUntil != nil {
		until = *r.CommissionEligibleUntil
	}
	return at.Before(until)
}

// CommissionRecord 佣金流水:被绑定用户每笔真实付费(订阅/超额)按落账时比例计一条。
// (source_type, source_id) 唯一 = 幂等兜底,叠加 markPaid/MarkOverflowPaid 的 PENDING 状态机守卫。
type CommissionRecord struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	AgencyID        uuid.UUID `gorm:"column:agency_id;type:uuid;index;not null" json:"agencyId"`
	UserID          uuid.UUID `gorm:"column:user_id;type:uuid;not null" json:"userId"` // 付费用户(脱敏展示用)
	SourceType      string    `gorm:"column:source_type;not null;uniqueIndex:uq_commission_source,priority:1" json:"sourceType"`
	SourceID        uuid.UUID `gorm:"column:source_id;type:uuid;not null;uniqueIndex:uq_commission_source,priority:2" json:"sourceId"`
	BaseAmountCents int       `gorm:"column:base_amount_cents;not null" json:"baseAmountCents"` // 原单金额
	CommissionBP    int       `gorm:"column:commission_bp;not null" json:"commissionBp"`        // 入账时比例快照(调比例不重算历史)
	AmountCents     int       `gorm:"column:amount_cents;not null" json:"amountCents"`          // 佣金 = base*bp/10000
	CreatedAt       time.Time `json:"createdAt"`
}

func (c *CommissionRecord) BeforeCreate(*gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

// AgencyWithdrawal 提现申请。可提现余额 = SUM(佣金) − SUM(提现 WHERE status IN (PENDING,PAID))。
// PENDING 占用防重复套现,REJECTED 释放。审核=人工线下打款后标记 PAID / 驳回 REJECTED。
type AgencyWithdrawal struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	AgencyID    uuid.UUID  `gorm:"column:agency_id;type:uuid;index;not null" json:"agencyId"`
	AmountCents int        `gorm:"column:amount_cents;not null" json:"amountCents"`
	Status      string     `gorm:"not null;default:'PENDING';index" json:"status"`
	Note        string     `gorm:"type:text" json:"note,omitempty"`                          // 申请时填收款方式;审核时填打款凭证/驳回原因
	ReviewedBy  *uuid.UUID `gorm:"column:reviewed_by;type:uuid" json:"reviewedBy,omitempty"` // 审核管理员
	ReviewedAt  *time.Time `json:"reviewedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

func (w *AgencyWithdrawal) BeforeCreate(*gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

// BonusCreditGrant 一次性赠送积分。语义=「有效期内抬高该 workspace 的周期额度上限」:
// 新人经邀请码注册,首个订阅周期额度 = PlanCredits + Credits,周期结束(ExpiresAt 过)自动回落。
// RefID 唯一 = 一次绑定只送一次;额度挂 workspace(与 quota 体系一致)。
type BonusCreditGrant struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"column:workspace_id;type:uuid;index;not null" json:"workspaceId"`
	UserID      uuid.UUID  `gorm:"column:user_id;type:uuid;not null" json:"userId"`
	Credits     int        `gorm:"not null" json:"credits"`
	Source      string     `gorm:"not null" json:"source"`                                     // AGENCY_INVITE(留扩展:运营活动等)
	RefID       *uuid.UUID `gorm:"column:ref_id;type:uuid;uniqueIndex" json:"refId,omitempty"` // 指向 AgencyReferral.ID
	ExpiresAt   time.Time  `gorm:"column:expires_at;not null;index" json:"expiresAt"`          // = 注册时首个订阅周期末
	CreatedAt   time.Time  `json:"createdAt"`
}

func (g *BonusCreditGrant) BeforeCreate(*gorm.DB) error {
	if g.ID == uuid.Nil {
		g.ID = uuid.New()
	}
	return nil
}

// CommissionCents 把原单金额按万分比折算成佣金(分)。四舍五入不做,向下取整(对平台友好、无争议)。
func CommissionCents(baseCents, bp int) int {
	return baseCents * bp / 10000
}
