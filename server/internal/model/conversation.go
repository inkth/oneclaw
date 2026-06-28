package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Conversation 一条会话线程:一组连续派活(AgentTask)归属其下,对应前端左侧会话列表的一项。
// 多会话改造前所有任务扁平挂 workspace;现以 conversation 居中,任务挂会话、会话挂 workspace。
type Conversation struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID uuid.UUID `gorm:"column:workspace_id;type:uuid;not null;index:idx_conv_ws_updated" json:"workspaceId"`
	Title       string    `gorm:"type:text;not null" json:"title"`
	// LastAgent 最近一条任务的 Agent 类型,列表项据此显示图标(ANALYST|DIRECTOR|LISTING|REVIEW|TRYON)。
	LastAgent string    `json:"lastAgent,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	// UpdatedAt 最后活跃时间(新任务落库时手动 bump),列表按它倒序。
	UpdatedAt time.Time `gorm:"index:idx_conv_ws_updated" json:"updatedAt"`
}

func (c *Conversation) BeforeCreate(*gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}
