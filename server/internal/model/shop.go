package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Shop 工作台绑定的店铺。(workspace_id, platform, external_id) 唯一。
// 核心指标为缓存值,接平台 API 后由同步任务刷新。
type Shop struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID       uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index:idx_shop_ws_status;uniqueIndex:uq_shop_ws_plat_ext" json:"workspaceId"`
	Name              string     `gorm:"not null" json:"name"`
	Platform          string     `gorm:"not null;uniqueIndex:uq_shop_ws_plat_ext" json:"platform"`
	Country           *string    `json:"country,omitempty"`
	Status            string     `gorm:"not null;default:'PENDING';index:idx_shop_ws_status" json:"status"`
	ExternalID        *string    `gorm:"column:external_id;uniqueIndex:uq_shop_ws_plat_ext" json:"externalId,omitempty"`
	TotalRevenueCents int        `gorm:"default:0" json:"totalRevenueCents"`
	Orders            int        `gorm:"default:0" json:"orders"`
	ItemsSold         int        `gorm:"default:0" json:"itemsSold"`
	Visitors          int        `gorm:"default:0" json:"visitors"`
	ConversionRate    float64    `gorm:"default:0" json:"conversionRate"`
	LastSyncAt        *time.Time `json:"lastSyncAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

func (s *Shop) BeforeCreate(*gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// ModelAsset 数字人 / 真人模特资产。
// is_preset=true 为全局预置人设(workspace_id 为空,所有工作台可见、只读);
// ref_image_urls 存同一人设的多镜头参考图组(正脸/半身/侧脸/场景),供出片 input_references 用。
type ModelAsset struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID  *uuid.UUID `gorm:"column:workspace_id;type:uuid;index:idx_model_ws_kind" json:"workspaceId,omitempty"`
	IsPreset     bool       `gorm:"column:is_preset;default:false;index" json:"isPreset"`
	Name         string     `gorm:"not null" json:"name"`
	Kind         string     `gorm:"not null;default:'DIGITAL_HUMAN';index:idx_model_ws_kind" json:"kind"`
	Gender       string     `gorm:"not null;default:'NEUTRAL'" json:"gender"`
	AvatarURL    *string    `gorm:"column:avatar_url" json:"avatarUrl,omitempty"`
	PreviewURL   *string    `gorm:"column:preview_url" json:"previewUrl,omitempty"`
	RefImageURLs JSONB      `gorm:"column:ref_image_urls;type:jsonb" json:"refImageUrls,omitempty"`
	Style        *string    `json:"style,omitempty"`
	Description  *string    `gorm:"type:text" json:"description,omitempty"`
	ExternalID   *string    `gorm:"column:external_id" json:"externalId,omitempty"`
	UsageCount   int        `gorm:"default:0" json:"usageCount"`
	IsFavorite   bool       `gorm:"default:false" json:"isFavorite"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

func (m *ModelAsset) BeforeCreate(*gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}
