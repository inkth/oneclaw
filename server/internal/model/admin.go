package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 管理员写操作类型(admin_audit_logs.action)。只增不改,供审计追责。
const (
	AuditUserBan          = "USER_BAN"
	AuditUserUnban        = "USER_UNBAN"
	AuditGrantCredits     = "GRANT_CREDITS"
	AuditSetPlan          = "SET_PLAN"
	AuditOrderConfirm     = "ORDER_CONFIRM"
	AuditOrderRefund      = "ORDER_REFUND"
	AuditOverflowSettle   = "OVERFLOW_SETTLE"
	AuditAgencyCreate     = "AGENCY_CREATE"
	AuditAgencyUpdate     = "AGENCY_UPDATE"
	AuditPartnerReview    = "PARTNER_REVIEW"
	AuditWithdrawalReview = "WITHDRAWAL_REVIEW"
)

// AdminAuditLog 管理员后台每次写操作留痕(谁 / 何时 / 对谁 / 做了什么)。
// 平台无 RBAC 角色分级(admin/user 二元 + env 白名单),此表是运营合规底线。
// TargetID 用 string(既能存 uuid,也能存 out_trade_no 等业务号);只增不改。
type AdminAuditLog struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	AdminID    uuid.UUID `gorm:"column:admin_id;type:uuid;index;not null" json:"adminId"`
	Action     string    `gorm:"not null;index" json:"action"`                  // 见 Audit* 常量
	TargetType string    `gorm:"column:target_type;not null" json:"targetType"` // user / workspace / order / overflow_bill ...
	TargetID   string    `gorm:"column:target_id;index" json:"targetId"`
	Detail     string    `gorm:"type:text" json:"detail,omitempty"` // 人类可读摘要(含变更前后 / 金额 / 备注)
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
}

func (l *AdminAuditLog) BeforeCreate(*gorm.DB) error {
	if l.ID == uuid.Nil {
		l.ID = uuid.New()
	}
	return nil
}
