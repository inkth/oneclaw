package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AgentTask 一次 Agent 派发(异步执行)。status: QUEUED→RUNNING→DONE/FAILED。
type AgentTask struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID  uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index:idx_task_ws_created;index:idx_task_ws_agent_created" json:"workspaceId"`
	Agent        string     `gorm:"not null;index:idx_task_ws_agent_created" json:"agent"` // ANALYST|DIRECTOR|LISTING|TEAM|REVIEW
	Status       string     `gorm:"not null;default:'QUEUED'" json:"status"`
	Input        string     `gorm:"type:text;not null" json:"input"`
	Output       *string    `gorm:"type:text" json:"output,omitempty"`
	Metadata     JSONB      `gorm:"type:jsonb" json:"metadata,omitempty"`
	Model        *string    `json:"model,omitempty"`
	TokensIn     *int       `gorm:"column:tokens_in" json:"tokensIn,omitempty"`
	TokensOut    *int       `gorm:"column:tokens_out" json:"tokensOut,omitempty"`
	CostCents    *int       `gorm:"column:cost_cents" json:"costCents,omitempty"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	FinishedAt   *time.Time `json:"finishedAt,omitempty"`
	ErrorMessage *string    `gorm:"type:text" json:"errorMessage,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func (t *AgentTask) BeforeCreate(*gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}
