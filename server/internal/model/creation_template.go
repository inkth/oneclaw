package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CreationTemplate 视频创作模板(套用后驱动视频生成)。
type CreationTemplate struct {
	ID                  uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID         uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index:idx_tpl_ws_fav" json:"workspaceId"`
	Name                string     `gorm:"not null" json:"name"`
	Description         *string    `gorm:"type:text" json:"description,omitempty"`
	Emoji               *string    `gorm:"default:'🎬'" json:"emoji,omitempty"`
	Engine              string     `gorm:"not null;default:'seedance'" json:"engine"`
	DurationSec         int        `gorm:"column:duration_sec;default:5" json:"durationSec"`
	AspectRatio         string     `gorm:"column:aspect_ratio;default:'9:16'" json:"aspectRatio"`
	Style               string     `gorm:"not null;default:'SCENE'" json:"style"`
	PromptTemplate      string     `gorm:"column:prompt_template;type:text;not null" json:"promptTemplate"`
	DefaultProductID    *uuid.UUID `gorm:"column:default_product_id;type:uuid" json:"defaultProductId,omitempty"`
	DefaultModelAssetID *uuid.UUID `gorm:"column:default_model_asset_id;type:uuid" json:"defaultModelAssetId,omitempty"`
	DefaultMaterialIDs  []string   `gorm:"column:default_material_ids;serializer:json" json:"defaultMaterialIds"`
	GenerateScript      bool       `gorm:"column:generate_script;default:false" json:"generateScript"`
	GenerateCover       bool       `gorm:"column:generate_cover;default:true" json:"generateCover"`
	IsFavorite          bool       `gorm:"column:is_favorite;default:false" json:"isFavorite"`
	UsageCount          int        `gorm:"column:usage_count;default:0" json:"usageCount"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
}

func (t *CreationTemplate) BeforeCreate(*gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}
