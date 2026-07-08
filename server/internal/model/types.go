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

	// 收藏夹内的推进台阶:候选(收藏默认,先存着)→ 评估中 → 推荐 → 归档。
	ProductCandidate   = "CANDIDATE"
	ProductEvaluating  = "EVALUATING"
	ProductRecommended = "RECOMMENDED"
	ProductArchived    = "ARCHIVED"

	// 商品成本来源:系统按品类/市场估算、用户回填真实成本、货源比价回填(预留)。
	CostSourceEstimate = "ESTIMATE"
	CostSourceManual   = "MANUAL"
	CostSourceSourced  = "SOURCED"

	ShopStatusConnected    = "CONNECTED"
	ShopStatusPending      = "PENDING"
	ShopStatusDisconnected = "DISCONNECTED"
	ShopStatusError        = "ERROR"

	ModelKindDigitalHuman = "DIGITAL_HUMAN"
	ModelKindRealPerson   = "REAL_PERSON"
	ModelGenderFemale     = "FEMALE"
	ModelGenderMale       = "MALE"
	ModelGenderNeutral    = "NEUTRAL"

	AgentAdvisor       = "ADVISOR" // 跨境顾问:全局对话式助理(答疑/排路线/接力派活),免积分
	AgentAnalyst       = "ANALYST"
	AgentDirector      = "DIRECTOR"
	AgentListing       = "LISTING"
	AgentTryOn         = "TRYON"          // 虚拟试穿:模特图 + 服饰图 → 上身图(纯出图,不走 LLM)
	AgentVideoAnalysis = "VIDEO_ANALYSIS" // 视频解析:上传带货视频 → 抽音轨喂多模态模型 → 逐句脚本+中文翻译+带货拆解
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
