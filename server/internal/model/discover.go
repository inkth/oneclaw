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
	NameZh         string    `gorm:"column:name_zh;type:text;default:''" json:"nameZh"` // 商品标题中文译文,后台异步翻译回填(空=尚未翻译,前端退回原文)
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
	// 近窗销量/GMV(列表级,EchoTik 官方口径)。榜单同步时与封面同批从 product/detail 回填,
	// 详情页刷新时也更新;0=暂无数据(未拉过详情)。命名对齐 DiscoverSeller。
	Sale7dCnt     int       `gorm:"column:sale7d_cnt;default:0" json:"sale7dCnt"`
	Sale30dCnt    int       `gorm:"column:sale30d_cnt;default:0" json:"sale30dCnt"`
	Gmv7dCents    int       `gorm:"column:gmv7d_cents;default:0" json:"gmv7dCents"`
	Gmv30dCents   int       `gorm:"column:gmv30d_cents;default:0" json:"gmv30dCents"`
	CoverUrls     JSONB     `gorm:"type:jsonb" json:"coverUrls,omitempty"`
	Raw           JSONB     `gorm:"type:jsonb" json:"-"`
	LastFetchedAt time.Time `gorm:"index" json:"lastFetchedAt"`

	// 详情级(详情页按条件刷新,对标达人/店铺/视频两级新鲜度;趋势走 DiscoverSnapshot 差分,不在此存)。
	DetailExtras      JSONB     `gorm:"column:detail_extras;type:jsonb" json:"-"`      // 图廊/评分/描述/窗口/累计权威值
	DetailInfluencers JSONB     `gorm:"column:detail_influencers;type:jsonb" json:"-"` // []ProductInfluencerDTO
	DetailVideos      JSONB     `gorm:"column:detail_videos;type:jsonb" json:"-"`      // []ProductVideoDTO
	DetailFetchedAt   time.Time `gorm:"column:detail_fetched_at;index" json:"detailFetchedAt"`
	// DetailExtrasAt 单指 detail_extras 的新鲜度(同步路径顺带回填也会更新;
	// DetailFetchedAt 仍代表「达人/视频整包」拉过,两者解耦)。
	DetailExtrasAt time.Time `gorm:"column:detail_extras_at" json:"detailExtrasAt"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
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

// DiscoverBackfillCursor 全量回填进度游标:按 (provider, region, category_id) 记录某地区某一级
// 类目前 N 页已落库到第几页(DonePages)、是否拉完(Completed)。供 --backfill-products 断点续跑,
// 已完成组合/已拉页跳过,不再重复请求 EchoTik。
type DiscoverBackfillCursor struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	Provider   string    `gorm:"not null;uniqueIndex:uq_dbc_key" json:"provider"`
	Kind       string    `gorm:"not null;default:'product';uniqueIndex:uq_dbc_key" json:"kind"` // product|seller|influencer|video
	Region     string    `gorm:"not null;uniqueIndex:uq_dbc_key" json:"region"`
	CategoryID string    `gorm:"column:category_id;not null;uniqueIndex:uq_dbc_key" json:"categoryId"`
	DonePages  int       `gorm:"column:done_pages;default:0" json:"donePages"`
	Completed  bool      `gorm:"default:false" json:"completed"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func (c *DiscoverBackfillCursor) BeforeCreate(*gorm.DB) error {
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

// WorkspaceDiscoverFavorite 工作台对店铺/达人/视频的收藏关系。
// (workspace_id, kind, external_id, region) 唯一。kind = seller | influencer | video。
// 注:实体已落库(DiscoverSeller/Influencer/Video),收藏页直接读主表渲染;Snapshot 字段已废弃保留。
type WorkspaceDiscoverFavorite struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	WorkspaceID uuid.UUID `gorm:"column:workspace_id;type:uuid;not null;uniqueIndex:uq_wdf_key" json:"workspaceId"`
	Kind        string    `gorm:"not null;uniqueIndex:uq_wdf_key" json:"kind"`
	ExternalID  string    `gorm:"column:external_id;not null;uniqueIndex:uq_wdf_key" json:"externalId"`
	Region      string    `gorm:"not null;uniqueIndex:uq_wdf_key" json:"region"`
	Snapshot    JSONB     `gorm:"type:jsonb" json:"snapshot,omitempty"` // deprecated: 实体落库后改读主表渲染,不再写/读
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

// DiscoverInfluencer EchoTik 达人(全局,非工作台维度)。(provider, external_id, region) 唯一,
// external_id = EchoTik user_id。对标 DiscoverProduct,但区分两级新鲜度:
//   - 列表级字段(nick_name/followers/sale_* 等)由榜单同步刷新,记 list_fetched_at;
//   - 详情级字段(gender/signature/videos/avatar 等)由详情页按条件刷新,记 detail_fetched_at。
//
// 这样列表 upsert 绝不覆盖详情字段,详情页可「读 DB + 按 detail_fetched_at TTL 条件刷新」。
type DiscoverInfluencer struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	Provider   string    `gorm:"not null;uniqueIndex:uq_dinf_provider_ext_region" json:"provider"`
	ExternalID string    `gorm:"column:external_id;not null;uniqueIndex:uq_dinf_provider_ext_region" json:"externalId"`
	Region     string    `gorm:"not null;uniqueIndex:uq_dinf_provider_ext_region" json:"region"`

	// ── 列表级(榜单同步刷新) ──
	UniqueID     string  `gorm:"column:unique_id;default:''" json:"uniqueId"`
	NickName     string  `gorm:"default:''" json:"nickName"`
	Category     string  `gorm:"default:''" json:"category"`
	EcScore      float64 `gorm:"default:0" json:"ecScore"`
	Followers    int     `gorm:"default:0" json:"followers"`
	DiggCnt      int     `gorm:"default:0" json:"diggCnt"`
	ProductCnt   int     `gorm:"default:0" json:"productCnt"`
	PostVideoCnt int     `gorm:"default:0" json:"postVideoCnt"`
	LiveCnt      int     `gorm:"default:0" json:"liveCnt"`
	SaleCnt      int     `gorm:"default:0" json:"saleCnt"`
	SaleGmvCents int     `gorm:"default:0" json:"saleGmvCents"`

	// ── 详情级(详情页按条件刷新) ──
	AvatarURL       string  `gorm:"column:avatar_url;type:text;default:''" json:"avatarUrl"` // 永久化到 COS
	Gender          string  `gorm:"default:''" json:"gender"`
	Language        string  `gorm:"default:''" json:"language"`
	ContactEmail    string  `gorm:"column:contact_email;default:''" json:"contactEmail"`
	Signature       string  `gorm:"type:text;default:''" json:"signature"`
	InteractionRate float64 `gorm:"default:0" json:"interactionRate"`
	Followers30d    int     `gorm:"column:followers30d;default:0" json:"followers30d"`
	ViewsCnt        int     `gorm:"column:views_cnt;default:0" json:"viewsCnt"`
	Videos          JSONB   `gorm:"type:jsonb" json:"-"` // []InfluencerVideoDTO 带货视频(详情子资源)
	Raw             JSONB   `gorm:"type:jsonb" json:"-"`

	IsTracked       bool      `gorm:"default:false;index" json:"isTracked"` // 被收藏/选品=高优先级刷新(P2 用)
	ListFetchedAt   time.Time `gorm:"index" json:"listFetchedAt"`
	DetailFetchedAt time.Time `gorm:"index" json:"detailFetchedAt"` // 零值=从未拉过详情
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (d *DiscoverInfluencer) BeforeCreate(*gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// DiscoverInfluencerSnapshot 达人每日累计指标快照。(discover_influencer_id, dt) 唯一。
// 既是 job 每日追加的时间序列,也是详情页趋势图的数据源:存累计值,趋势的「日增量」由相邻两天差分得到
// (突破 EchoTik trend 仅 14 天的限制,攒越久越完整)。对标 DiscoverSnapshot。
type DiscoverInfluencerSnapshot struct {
	ID                   uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	DiscoverInfluencerID uuid.UUID `gorm:"column:discover_influencer_id;type:uuid;not null;index;uniqueIndex:uq_dinf_snap_dt" json:"discoverInfluencerId"`
	Dt                   string    `gorm:"not null;index;uniqueIndex:uq_dinf_snap_dt" json:"dt"`
	Followers            int       `gorm:"default:0" json:"followers"` // 累计
	SaleCnt              int       `gorm:"default:0" json:"saleCnt"`   // 累计
	GmvCents             int       `gorm:"default:0" json:"gmvCents"`  // 累计
	CreatedAt            time.Time `json:"createdAt"`
}

func (s *DiscoverInfluencerSnapshot) BeforeCreate(*gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// DiscoverSeller EchoTik 店铺(全局)。(provider, external_id, region) 唯一,external_id = seller_id。
// 同 DiscoverInfluencer:两级新鲜度,列表 upsert 不覆盖详情字段。
type DiscoverSeller struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	Provider   string    `gorm:"not null;uniqueIndex:uq_dsel_provider_ext_region" json:"provider"`
	ExternalID string    `gorm:"column:external_id;not null;uniqueIndex:uq_dsel_provider_ext_region" json:"externalId"`
	Region     string    `gorm:"not null;uniqueIndex:uq_dsel_provider_ext_region" json:"region"`

	// ── 列表级 ──
	SellerName   string  `gorm:"default:''" json:"sellerName"`
	CoverURL     string  `gorm:"column:cover_url;type:text;default:''" json:"coverUrl"` // 永久化 COS
	Rating       float64 `gorm:"default:0" json:"rating"`
	Categories   JSONB   `gorm:"type:jsonb" json:"categories"` // []string
	ProductCnt   int     `gorm:"default:0" json:"productCnt"`
	SaleCnt      int     `gorm:"default:0" json:"saleCnt"`
	SaleGmvCents int     `gorm:"default:0" json:"saleGmvCents"`
	IflCnt       int     `gorm:"default:0" json:"iflCnt"`
	VideoCnt     int     `gorm:"default:0" json:"videoCnt"`
	LiveCnt      int     `gorm:"default:0" json:"liveCnt"`

	// ── 详情级 ──
	SellerLink    string `gorm:"column:seller_link;type:text;default:''" json:"sellerLink"`
	AvgPriceCents int    `gorm:"default:0" json:"avgPriceCents"`
	Sale7dCnt     int    `gorm:"column:sale7d_cnt;default:0" json:"sale7dCnt"`
	Sale30dCnt    int    `gorm:"column:sale30d_cnt;default:0" json:"sale30dCnt"`
	Gmv7dCents    int    `gorm:"column:gmv7d_cents;default:0" json:"gmv7dCents"`
	Gmv30dCents   int    `gorm:"column:gmv30d_cents;default:0" json:"gmv30dCents"`
	// 累计权威值(seller/detail 口径)。榜单行的 sale_cnt 等按 EchoTik 文档是「当前榜单
	// 周期的增量」(天/周/月各不同),与累计口径不能混写一列,故分列;0=未拉过详情。
	TotalSaleCnt    int   `gorm:"column:total_sale_cnt;default:0" json:"totalSaleCnt"`
	TotalGmvCents   int   `gorm:"column:total_gmv_cents;default:0" json:"totalGmvCents"`
	TotalIflCnt     int   `gorm:"column:total_ifl_cnt;default:0" json:"totalIflCnt"`
	TotalVideoCnt   int   `gorm:"column:total_video_cnt;default:0" json:"totalVideoCnt"`
	TotalLiveCnt    int   `gorm:"column:total_live_cnt;default:0" json:"totalLiveCnt"`
	CrawlProductCnt int   `gorm:"column:crawl_product_cnt;default:0" json:"crawlProductCnt"` // 在售(在店)商品数
	Products        JSONB `gorm:"type:jsonb" json:"-"`                                       // []EntityProductDTO,详情子资源
	Raw             JSONB `gorm:"type:jsonb" json:"-"`

	IsTracked       bool      `gorm:"default:false;index" json:"isTracked"`
	ListFetchedAt   time.Time `gorm:"index" json:"listFetchedAt"`
	DetailFetchedAt time.Time `gorm:"index" json:"detailFetchedAt"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (d *DiscoverSeller) BeforeCreate(*gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// DiscoverSellerSnapshot 店铺每日累计快照。(discover_seller_id, dt) 唯一。趋势由相邻两天差分。
type DiscoverSellerSnapshot struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	DiscoverSellerID uuid.UUID `gorm:"column:discover_seller_id;type:uuid;not null;index;uniqueIndex:uq_dsel_snap_dt" json:"discoverSellerId"`
	Dt               string    `gorm:"not null;index;uniqueIndex:uq_dsel_snap_dt" json:"dt"`
	SaleCnt          int       `gorm:"default:0" json:"saleCnt"`  // 累计
	GmvCents         int       `gorm:"default:0" json:"gmvCents"` // 累计
	CreatedAt        time.Time `json:"createdAt"`
}

func (s *DiscoverSellerSnapshot) BeforeCreate(*gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// DiscoverVideo EchoTik 带货视频(全局)。(provider, external_id, region) 唯一,external_id = video_id。
// 同上两级新鲜度。当前 VideoDetailDTO 不含趋势,但仍每日落快照,为复盘/趋势攒数据底座。
type DiscoverVideo struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	Provider   string    `gorm:"not null;uniqueIndex:uq_dvid_provider_ext_region" json:"provider"`
	ExternalID string    `gorm:"column:external_id;not null;uniqueIndex:uq_dvid_provider_ext_region" json:"externalId"`
	Region     string    `gorm:"not null;uniqueIndex:uq_dvid_provider_ext_region" json:"region"`

	// ── 列表级 ──
	NickName     string `gorm:"default:''" json:"nickName"`
	UniqueID     string `gorm:"column:unique_id;default:''" json:"uniqueId"`
	CoverURL     string `gorm:"column:cover_url;type:text;default:''" json:"coverUrl"`   // 永久化 COS
	AvatarURL    string `gorm:"column:avatar_url;type:text;default:''" json:"avatarUrl"` // 永久化 COS
	Desc         string `gorm:"column:video_desc;type:text;default:''" json:"desc"`
	DescZh       string `gorm:"column:desc_zh;type:text;default:''" json:"descZh"` // 视频文案中文译文,后台异步翻译回填(空=尚未翻译,前端退回原文)
	Category     string `gorm:"default:''" json:"category"`
	Duration     int    `gorm:"default:0" json:"duration"`
	CreateTime   string `gorm:"column:create_time;default:''" json:"createTime"`
	Views        int    `gorm:"default:0" json:"views"`
	Digg         int    `gorm:"default:0" json:"digg"`
	Comments     int    `gorm:"default:0" json:"comments"`
	Shares       int    `gorm:"default:0" json:"shares"`
	SaleCnt      int    `gorm:"default:0" json:"saleCnt"`
	SaleGmvCents int    `gorm:"default:0" json:"saleGmvCents"`

	// ── 详情级 ──
	UserID      string `gorm:"column:user_id;default:''" json:"userId"`
	IsAd        bool   `gorm:"column:is_ad;default:false" json:"isAd"`
	CreatedByAI bool   `gorm:"column:created_by_ai;default:false" json:"createdByAi"`
	Views7d     int    `gorm:"column:views7d;default:0" json:"views7d"`
	Views30d    int    `gorm:"column:views30d;default:0" json:"views30d"`
	Favorites   int    `gorm:"default:0" json:"favorites"`
	// 累计权威值(video/detail 口径)。榜单行的 views 等按 EchoTik 文档是「榜单周期增量」,
	// 与累计不能混写一列(同 DiscoverSeller 的 total_* 分列);0=未拉过详情。
	TotalViews    int   `gorm:"column:total_views;default:0" json:"totalViews"`
	TotalDigg     int   `gorm:"column:total_digg;default:0" json:"totalDigg"`
	TotalComments int   `gorm:"column:total_comments;default:0" json:"totalComments"`
	TotalShares   int   `gorm:"column:total_shares;default:0" json:"totalShares"`
	TotalSaleCnt  int   `gorm:"column:total_sale_cnt;default:0" json:"totalSaleCnt"`
	TotalGmvCents int   `gorm:"column:total_gmv_cents;default:0" json:"totalGmvCents"`
	Products      JSONB `gorm:"type:jsonb" json:"-"` // []EntityProductDTO 带货商品
	Raw           JSONB `gorm:"type:jsonb" json:"-"`

	// ── 爆款永久化 + AI 拆解(sale_cnt>阈值 的热门视频后台预计算,见 discover_video_pipeline.go)──
	VideoURL         string    `gorm:"column:video_url;type:text;default:''" json:"videoUrl"` // 无水印 mp4 转存 COS 永久地址;空=未转存
	Analysis         JSONB     `gorm:"type:jsonb" json:"-"`                                   // videoAnalysisOut 拆解结果;空=未拆解
	AnalyzedAt       time.Time `gorm:"column:analyzed_at" json:"-"`
	VideoAttempts    int       `gorm:"column:video_attempts;default:0" json:"-"`    // 转存失败退避计数
	AnalysisAttempts int       `gorm:"column:analysis_attempts;default:0" json:"-"` // 拆解失败退避计数

	IsTracked       bool      `gorm:"default:false;index" json:"isTracked"`
	ListFetchedAt   time.Time `gorm:"index" json:"listFetchedAt"`
	DetailFetchedAt time.Time `gorm:"index" json:"detailFetchedAt"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (d *DiscoverVideo) BeforeCreate(*gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// DiscoverVideoSnapshot 视频每日累计快照。(discover_video_id, dt) 唯一。当前只写不读(攒数据)。
type DiscoverVideoSnapshot struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	DiscoverVideoID uuid.UUID `gorm:"column:discover_video_id;type:uuid;not null;index;uniqueIndex:uq_dvid_snap_dt" json:"discoverVideoId"`
	Dt              string    `gorm:"not null;index;uniqueIndex:uq_dvid_snap_dt" json:"dt"`
	Views           int       `gorm:"default:0" json:"views"`    // 累计
	SaleCnt         int       `gorm:"default:0" json:"saleCnt"`  // 累计
	GmvCents        int       `gorm:"default:0" json:"gmvCents"` // 累计
	CreatedAt       time.Time `json:"createdAt"`
}

func (s *DiscoverVideoSnapshot) BeforeCreate(*gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// EntityRanklistEntry 店铺/达人/视频榜单顺序快照。
// (provider, kind, region, rank_type, rank_field, category_id, page_num) 唯一。
// 取代 DiscoverCache 存榜单:榜单读 = 本表顺序 + 关联实体主表渲染(零 EchoTik);job 定时刷新顺序。
// 对标商品的 RanklistCacheEntry,但多 kind(三类共用)、category_id(类目维度)与 page_num(翻页维度)。
// 注:page_num 是后加维度,旧唯一索引名 uq_ere_key 已废,改用 uq_ere_pg(main.go 启动时先 DROP 旧索引)。
type EntityRanklistEntry struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	Provider    string    `gorm:"not null;uniqueIndex:uq_ere_pg" json:"provider"`
	Kind        string    `gorm:"not null;uniqueIndex:uq_ere_pg" json:"kind"`
	Region      string    `gorm:"not null;uniqueIndex:uq_ere_pg" json:"region"`
	RankType    int       `gorm:"column:rank_type;not null;uniqueIndex:uq_ere_pg" json:"rankType"`
	RankField   int       `gorm:"column:rank_field;not null;uniqueIndex:uq_ere_pg" json:"rankField"`
	CategoryID  string    `gorm:"column:category_id;not null;default:'';uniqueIndex:uq_ere_pg" json:"categoryId"`
	PageNum     int       `gorm:"column:page_num;not null;default:1;uniqueIndex:uq_ere_pg" json:"pageNum"`
	ExternalIDs []string  `gorm:"column:external_ids;serializer:json" json:"externalIds"`
	FetchedAt   time.Time `gorm:"column:fetched_at" json:"fetchedAt"`
}

func (e *EntityRanklistEntry) BeforeCreate(*gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}
