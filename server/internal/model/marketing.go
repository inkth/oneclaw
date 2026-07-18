package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NewsletterSubscription 落地页邮件订阅。email 唯一。
type NewsletterSubscription struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Email     string    `gorm:"uniqueIndex;not null" json:"email"`
	Source    *string   `json:"source,omitempty"` // 来源页面/banner
	CreatedAt time.Time `json:"createdAt"`
}

func (n *NewsletterSubscription) BeforeCreate(*gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return nil
}

// DemoRequest 预约演示表单。
type DemoRequest struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Email     string    `gorm:"not null" json:"email"`
	Company   *string   `json:"company,omitempty"`
	Message   *string   `gorm:"type:text" json:"message,omitempty"`
	Status    string    `gorm:"not null;default:'new'" json:"status"` // new | contacted | scheduled | closed
	CreatedAt time.Time `json:"createdAt"`
}

func (d *DemoRequest) BeforeCreate(*gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// PartnerApplication 代理商注册申请。手机号唯一，重复提交只更新代理商名称。
type PartnerApplication struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Phone     string    `gorm:"uniqueIndex;not null" json:"phone"`
	Status    string    `gorm:"not null;default:'PENDING';index" json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (p *PartnerApplication) BeforeCreate(*gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
