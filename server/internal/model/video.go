package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Video 一条生成视频。processing: PENDING→GENERATING→COMPLETED/FAILED。
// 走 OpenRouter /api/v1/videos 异步:ProviderJobID + PollingURL 用于轮询。
type Video struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID   uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index:idx_video_ws_created" json:"workspaceId"`
	ProductID     *uuid.UUID `gorm:"column:product_id;type:uuid" json:"productId,omitempty"`
	ModelAssetID  *uuid.UUID `gorm:"column:model_asset_id;type:uuid" json:"modelAssetId,omitempty"`
	TemplateID    *uuid.UUID `gorm:"column:template_id;type:uuid" json:"templateId,omitempty"`
	Title         string     `gorm:"not null" json:"title"`
	Style         string     `gorm:"not null;default:'SCENE'" json:"style"`
	DurationSec   int        `gorm:"column:duration_sec;default:5" json:"durationSec"`
	AspectRatio   string     `gorm:"column:aspect_ratio;default:'9:16'" json:"aspectRatio"`
	Prompt        *string    `gorm:"type:text" json:"prompt,omitempty"`
	Script        *string    `gorm:"type:text" json:"script,omitempty"`
	FirstFrameURL *string    `gorm:"column:first_frame_url;type:text" json:"firstFrameUrl,omitempty"` // 图生视频首帧(如商品实拍图);留存供重试复用
	// ReferenceImageURLs input_references:跨整片保持商品/人脸一致的参考图(JSON 字符串数组);留存供 Retry/Rerender 复用。
	ReferenceImageURLs JSONB `gorm:"column:reference_image_urls;type:jsonb" json:"referenceImageUrls,omitempty"`

	ThumbnailURL  *string    `gorm:"column:thumbnail_url" json:"thumbnailUrl,omitempty"`
	VideoURL      *string    `gorm:"column:video_url" json:"videoUrl,omitempty"`
	Engine        *string    `json:"engine,omitempty"`                      // OpenRouter 视频模型 id
	ProviderJobID *string    `gorm:"column:provider_job_id" json:"-"`       // /videos 返回的 id
	PollingURL    *string    `gorm:"column:polling_url;type:text" json:"-"` // polling_url
	CostCents     int        `gorm:"column:cost_cents;default:0" json:"costCents"`
	Processing    string     `gorm:"not null;default:'PENDING';index" json:"processing"`
	ErrorMessage  *string    `gorm:"column:error_message;type:text" json:"errorMessage,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

func (v *Video) BeforeCreate(*gorm.DB) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	return nil
}
