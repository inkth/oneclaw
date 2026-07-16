package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Feedback 站内用户反馈(顶栏「反馈」入口提交)。仅登录用户可提,回访走手机号。
type Feedback struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"userId"`
	WorkspaceID *uuid.UUID `gorm:"type:uuid" json:"workspaceId,omitempty"`
	Type        string     `gorm:"not null;default:'issue'" json:"type"` // issue 问题 | idea 建议
	Content     string     `gorm:"type:text;not null" json:"content"`
	Pathname    string     `json:"pathname"` // 提交时所在页面,前端自动带上
	CreatedAt   time.Time  `json:"createdAt"`
}

func (f *Feedback) BeforeCreate(*gorm.DB) error {
	if f.ID == uuid.Nil {
		f.ID = uuid.New()
	}
	return nil
}
