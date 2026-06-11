package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

// 枚举常量(保留 Prisma 的大写值以兼容现有前端)。
const (
	RoleOwner  = "OWNER"
	RoleAdmin  = "ADMIN"
	RoleMember = "MEMBER"

	PlanFree = "FREE"
	PlanPro  = "PRO"
	PlanTeam = "TEAM"

	ProductRecommended = "RECOMMENDED"
	ProductEvaluating  = "EVALUATING"
	ProductArchived    = "ARCHIVED"

	ShopStatusConnected    = "CONNECTED"
	ShopStatusPending      = "PENDING"
	ShopStatusDisconnected = "DISCONNECTED"
	ShopStatusError        = "ERROR"

	ModelKindDigitalHuman = "DIGITAL_HUMAN"
	ModelKindRealPerson   = "REAL_PERSON"
	ModelGenderFemale     = "FEMALE"
	ModelGenderMale       = "MALE"
	ModelGenderNeutral    = "NEUTRAL"

	AgentAnalyst  = "ANALYST"
	AgentDirector = "DIRECTOR"
	AgentListing  = "LISTING"
	// REVIEW 由 review/analyze 同步产出后落库(不走异步队列,不在 validAgents 内)。
	AgentReview = "REVIEW"

	TaskQueued  = "QUEUED"
	TaskRunning = "RUNNING"
	TaskDone    = "DONE"
	TaskFailed  = "FAILED"

	VideoPending    = "PENDING"
	VideoGenerating = "GENERATING"
	VideoCompleted  = "COMPLETED"
	VideoFailed     = "FAILED"

	VideoStyleUnboxing    = "UNBOXING"
	VideoStyleComparison  = "COMPARISON"
	VideoStyleScene       = "SCENE"
	VideoStyleBeforeAfter = "BEFORE_AFTER"
)

// JSONB 是存进 Postgres jsonb 列的原始 JSON。
type JSONB json.RawMessage

func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSONB) Scan(src any) error {
	if src == nil {
		*j = nil
		return nil
	}
	switch v := src.(type) {
	case []byte:
		*j = append((*j)[:0], v...)
		return nil
	case string:
		*j = JSONB(v)
		return nil
	default:
		return errors.New("model.JSONB: unsupported Scan source")
	}
}

// GormDataType 让 AutoMigrate 用 jsonb 列。
func (JSONB) GormDataType() string { return "jsonb" }

func (j JSONB) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

func (j *JSONB) UnmarshalJSON(b []byte) error {
	*j = append((*j)[:0], b...)
	return nil
}
