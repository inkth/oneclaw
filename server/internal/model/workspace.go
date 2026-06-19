package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Workspace 多租户容器。
type Workspace struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Name          string     `gorm:"not null" json:"name"`
	Slug          string     `gorm:"uniqueIndex;not null" json:"slug"`
	Plan          string     `gorm:"not null;default:'FREE'" json:"plan"`
	PlanExpiresAt *time.Time `json:"planExpiresAt,omitempty"`
	// BillingCycleAnchor 计费周期锚点 = 首次/换档付费日。积分按「订阅月」(anniversary)重置,
	// 锚点取此值的「日」;为空(FREE/未付费)时回退 CreatedAt。续费同档不变,换档/过期重订重置。
	BillingCycleAnchor *time.Time `gorm:"column:billing_cycle_anchor" json:"billingCycleAnchor,omitempty"`
	OwnerID            uuid.UUID  `gorm:"column:owner_id;type:uuid;index;not null" json:"ownerId"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

func (w *Workspace) BeforeCreate(*gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

// Membership 用户-工作台角色。(user_id, workspace_id) 唯一。
type Membership struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID      uuid.UUID `gorm:"column:user_id;type:uuid;not null;uniqueIndex:uq_member_user_ws" json:"userId"`
	WorkspaceID uuid.UUID `gorm:"column:workspace_id;type:uuid;not null;uniqueIndex:uq_member_user_ws;index" json:"workspaceId"`
	Role        string    `gorm:"not null;default:'MEMBER'" json:"role"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (m *Membership) BeforeCreate(*gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}
