package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User 账号实体。手机号唯一(可空以兼容未来邮箱注册)。
type User struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Phone         *string    `gorm:"uniqueIndex" json:"phone,omitempty"`
	Email         *string    `gorm:"uniqueIndex" json:"email,omitempty"`
	Name          *string    `json:"name,omitempty"`
	Image         *string    `json:"image,omitempty"`
	PhoneVerified *time.Time `json:"phoneVerified,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

func (u *User) BeforeCreate(*gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// PhoneVerificationCode 短信验证码记录。CodeHash 存哈希,不存明文。
// Phase 1 无 Redis,验证码落 Postgres(对齐原 Prisma 设计)。
type PhoneVerificationCode struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Phone     string     `gorm:"index;not null" json:"phone"`
	CodeHash  string     `gorm:"not null" json:"-"`
	Attempts  int        `gorm:"default:0" json:"-"`
	Expires   time.Time  `gorm:"index" json:"-"`
	UsedAt    *time.Time `json:"-"`
	CreatedAt time.Time  `json:"-"`
}

func (p *PhoneVerificationCode) BeforeCreate(*gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
