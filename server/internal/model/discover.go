package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 注:所有含 ID/IDs 的字段都显式声明 column,避免 GORM 命名策略把
// ExternalIDs 转成 external_i_ds 之类,导致 OnConflict 列名对不上。

// DiscoverProduct EchoTik 商品缓存(全局,非工作台维度)。
// (provider, external_id, region) 唯一。
type DiscoverProduct struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	Provider       string    `gorm:"not null;uniqueIndex:uq_dp_provider_ext_region" json:"provider"`
	ExternalID     string    `gorm:"column:external_id;not null;uniqueIndex:uq_dp_provider_ext_region" json:"externalId"`
	Region         string    `gorm:"not null;uniqueIndex:uq_dp_provider_ext_region" json:"region"`
	Name           string    `gorm:"default:''" json:"name"`
	CategoryID     string    `gorm:"column:category_id;default:''" json:"categoryId"`
	CategoryL2ID   string    `gorm:"column:category_l2_id;default:''" json:"categoryL2Id"`
	CategoryL3ID   string    `gorm:"column:category_l3_id;default:''" json:"categoryL3Id"`
	MinPriceCents  int       `gorm:"default:0" json:"minPriceCents"`
	MaxPriceCents  int       `gorm:"default:0" json:"maxPriceCents"`
	AvgPriceCents  int       `gorm:"default:0" json:"avgPriceCents"`
	CommissionRate float64   `gorm:"default:0" json:"commissionRate"`
	TotalSaleCnt   int       `gorm:"default:0" json:"totalSaleCnt"`
	TotalSaleGmv   int       `gorm:"default:0" json:"totalSaleGmvCents"`
	TotalIflCnt    int       `gorm:"default:0" json:"totalIflCnt"`
	TotalVideoCnt  int       `gorm:"default:0" json:"totalVideoCnt"`
	TotalLiveCnt   int       `gorm:"default:0" json:"totalLiveCnt"`
	CoverUrls      JSONB     `gorm:"type:jsonb" json:"coverUrls,omitempty"`
	Raw            JSONB     `gorm:"type:jsonb" json:"-"`
	LastFetchedAt  time.Time `gorm:"index" json:"lastFetchedAt"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

func (d *DiscoverProduct) BeforeCreate(*gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// RanklistCacheEntry 榜单快照(external_ids 序列化为 JSON)。
// (provider, region, rank_type, rank_field) 唯一。
type RanklistCacheEntry struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	Provider    string    `gorm:"not null;uniqueIndex:uq_rce_key" json:"provider"`
	Region      string    `gorm:"not null;uniqueIndex:uq_rce_key" json:"region"`
	RankType    int       `gorm:"column:rank_type;not null;uniqueIndex:uq_rce_key" json:"rankType"`
	RankField   int       `gorm:"column:rank_field;not null;uniqueIndex:uq_rce_key" json:"rankField"`
	Date        string    `gorm:"default:''" json:"date"`
	ExternalIDs []string  `gorm:"column:external_ids;serializer:json" json:"externalIds"`
	FetchedAt   time.Time `gorm:"column:fetched_at" json:"fetchedAt"`
}

func (r *RanklistCacheEntry) BeforeCreate(*gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// DiscoverCache 通用 JSON 缓存:店铺/达人/视频榜 + 类目下拉的整段响应按 cache_key 缓存。
// 这些数据无工作台个性化,可全局复用;按 TTL 失效。
type DiscoverCache struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	CacheKey  string    `gorm:"column:cache_key;not null;uniqueIndex:uq_dc_key" json:"cacheKey"`
	Payload   JSONB     `gorm:"type:jsonb" json:"payload"`
	FetchedAt time.Time `gorm:"column:fetched_at" json:"fetchedAt"`
}

func (c *DiscoverCache) BeforeCreate(*gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

// DiscoverSnapshot 每日商品指标快照。(discover_product_id, dt) 唯一。
type DiscoverSnapshot struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	DiscoverProductID uuid.UUID `gorm:"column:discover_product_id;type:uuid;not null;index;uniqueIndex:uq_snap_dp_dt" json:"discoverProductId"`
	Dt                string    `gorm:"not null;index;uniqueIndex:uq_snap_dp_dt" json:"dt"`
	TotalSaleCnt      int       `gorm:"default:0" json:"totalSaleCnt"`
	TotalSaleGmv      int       `gorm:"default:0" json:"totalSaleGmvCents"`
	TotalIflCnt       int       `gorm:"default:0" json:"totalIflCnt"`
	TotalVideoCnt     int       `gorm:"default:0" json:"totalVideoCnt"`
	TotalLiveCnt      int       `gorm:"default:0" json:"totalLiveCnt"`
	CreatedAt         time.Time `json:"createdAt"`
}

func (s *DiscoverSnapshot) BeforeCreate(*gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// WorkspaceDiscoverInteraction 工作台对某个 EchoTik 商品的收藏/标签/备注。
// (workspace_id, discover_product_id) 唯一。
type WorkspaceDiscoverInteraction struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	WorkspaceID       uuid.UUID `gorm:"column:workspace_id;type:uuid;not null;uniqueIndex:uq_wdi_ws_dp" json:"workspaceId"`
	DiscoverProductID uuid.UUID `gorm:"column:discover_product_id;type:uuid;not null;uniqueIndex:uq_wdi_ws_dp" json:"discoverProductId"`
	IsStarred         bool      `gorm:"default:false" json:"isStarred"`
	Tags              []string  `gorm:"column:tags;serializer:json" json:"tags"`
	Note              *string   `json:"note,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

func (w *WorkspaceDiscoverInteraction) BeforeCreate(*gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

// WorkspaceDiscoverFavorite 工作台对店铺/达人/视频的收藏(这些实体不落库,故另存快照供收藏页渲染)。
// (workspace_id, kind, external_id, region) 唯一。kind = seller | influencer | video。
type WorkspaceDiscoverFavorite struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	WorkspaceID uuid.UUID `gorm:"column:workspace_id;type:uuid;not null;uniqueIndex:uq_wdf_key" json:"workspaceId"`
	Kind        string    `gorm:"not null;uniqueIndex:uq_wdf_key" json:"kind"`
	ExternalID  string    `gorm:"column:external_id;not null;uniqueIndex:uq_wdf_key" json:"externalId"`
	Region      string    `gorm:"not null;uniqueIndex:uq_wdf_key" json:"region"`
	Snapshot    JSONB     `gorm:"type:jsonb" json:"snapshot"` // {name, cover, subtitle, metric} 供收藏页渲染
	CreatedAt   time.Time `json:"createdAt"`
}

func (w *WorkspaceDiscoverFavorite) BeforeCreate(*gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

// CoverAsset EchoTik 防盗链封面永久化到 COS 后的映射(全局去重)。
// 同一张图的原始 URL(raw_url)是稳定的,故按 raw_hash = sha1(raw_url) 去重:
// 四榜(商品/店铺/达人/视频)跨 region、跨时间只下载/转存一次,后续命中直接复用 COS URL。
// 这取代了原来"只签名、3 天过期"的方案——COS URL 永久有效,前端永不裂图。
type CoverAsset struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	RawHash   string    `gorm:"column:raw_hash;not null;uniqueIndex:uq_cover_asset_hash" json:"rawHash"`
	RawURL    string    `gorm:"column:raw_url;type:text" json:"rawUrl"`
	CosURL    string    `gorm:"column:cos_url;type:text" json:"cosUrl"`
	CreatedAt time.Time `json:"createdAt"`
}

func (a *CoverAsset) BeforeCreate(*gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
