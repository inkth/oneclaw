package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Product 工作台内的选品记录。(workspace_id, discover_product_id) 唯一(已导入去重)。
type Product struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	WorkspaceID       uuid.UUID  `gorm:"column:workspace_id;type:uuid;not null;index:idx_prod_ws_status;uniqueIndex:uq_prod_ws_discover" json:"workspaceId"`
	ShopID            *uuid.UUID `gorm:"column:shop_id;type:uuid" json:"shopId,omitempty"`
	DiscoverProductID *uuid.UUID `gorm:"column:discover_product_id;type:uuid;uniqueIndex:uq_prod_ws_discover" json:"discoverProductId,omitempty"`
	Title             string     `gorm:"not null" json:"title"`
	Category          string     `gorm:"default:''" json:"category"`
	Emoji             *string    `gorm:"default:'📦'" json:"emoji,omitempty"`
	PriceCents        int        `gorm:"default:0" json:"priceCents"`
	CostCents         int        `gorm:"default:0" json:"costCents"`
	CostSource        string     `gorm:"default:'ESTIMATE'" json:"costSource"` // ESTIMATE | MANUAL | SOURCED
	MarginPct         int        `gorm:"default:0" json:"marginPct"`
	RoiScore          int        `gorm:"default:0" json:"roiScore"`
	MonthlySales      int        `gorm:"default:0" json:"monthlySales"`
	TrendDelta        int        `gorm:"default:0" json:"trendDelta"`
	Status            string     `gorm:"not null;default:'EVALUATING';index:idx_prod_ws_status" json:"status"`
	Note              *string    `json:"note,omitempty"`
	// CoverURL 用户回写的商品主图(Listing 出图设为主图);非空则覆盖 EchoTik 关联主图。
	// json:"-":对外主图统一走 ProductListItem.CoverURL(已合并回写值与 EchoTik 兜底)。
	CoverURL *string `gorm:"column:cover_url" json:"-"`
	// Images 自建商品的展示图(白底/场景/细节/俯拍,fal 据原图出);ImagesStatus 出图进度。
	// 「批量做商品」即出这几张图(纯出图、不依赖 LLM);文案是另开 Listing 按需生成。
	Images       JSONB  `gorm:"column:images;type:jsonb" json:"images,omitempty"`
	ImagesStatus string `gorm:"column:images_status;default:''" json:"imagesStatus,omitempty"` // PENDING|RUNNING|DONE|FAILED
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

func (p *Product) BeforeCreate(*gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
