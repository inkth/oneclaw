package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Material 用户上传的素材(图/视频/音频/字体等),原文存对象存储。
type Material struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID  uuid.UUID `gorm:"column:workspace_id;type:uuid;not null;index:idx_material_ws_type_created" json:"workspaceId"`
	Type         string    `gorm:"not null;index:idx_material_ws_type_created" json:"type"` // IMAGE|VIDEO|AUDIO|LOGO|WATERMARK|FONT
	OriginalName string    `gorm:"column:original_name;not null" json:"originalName"`
	URL          string    `gorm:"not null;default:''" json:"url"`
	StorageKey   *string   `gorm:"column:storage_key" json:"storageKey,omitempty"`
	ContentType  *string   `gorm:"column:content_type" json:"contentType,omitempty"`
	SizeBytes    int64     `gorm:"column:size_bytes;default:0" json:"sizeBytes"`
	Width        *int      `json:"width,omitempty"`
	Height       *int      `json:"height,omitempty"`
	DurationSec  *int      `gorm:"column:duration_sec" json:"durationSec,omitempty"`
	Tags         []string  `gorm:"serializer:json" json:"tags"`
	Note         *string   `json:"note,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (m *Material) BeforeCreate(*gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}
