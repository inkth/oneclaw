package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
	"github.com/faxianmao/server/internal/service/llm"
	"github.com/faxianmao/server/internal/storage"
)

const (
	providerEchoTik = "echotik"
	// cacheTTL 商品榜/视频榜读路径 SWR 陈旧阈值。上游 EchoTik 是 T-1 日粒度,
	// 12h 已足够新;与 DISCOVER_SYNC_INTERVAL_HOURS(默认 12)对齐。
	cacheTTL = 12 * time.Hour
	// entitySlowTTL 店铺/达人榜读路径 SWR 陈旧阈值:纯浏览参考、日更数据,一天一轮足够;
	// 与 DISCOVER_ENTITY_SYNC_INTERVAL_HOURS(默认 24)对齐。
	entitySlowTTL = 24 * time.Hour
)

type DiscoverService struct {
	db                 *gorm.DB
	echo               *echotik.Client
	storage            *storage.Storage
	llm                *llm.Client
	coverHTTP          *http.Client
	rehostCh           chan []string
	rehostInflight     map[string]struct{}
	rehostMu           sync.Mutex
	translateCh        chan []translateJob
	translateInflight  map[string]struct{}
	translateMu        sync.Mutex
	ranklistRefreshing sync.Map
	// enrichMinSale 后台同步路径的入库销量门槛:累计销量低于此值的商品整条跳过
	// (不入库、不写快照、不请求详情/封面、不投翻译),省 DB/跨境调用/COS/LLM。0=不设门槛。
	// 只作用于榜单预热/SWR 刷新;用户搜索路径不受限。已入库的存量行不删,只是不再更新。
	enrichMinSale int
}

func NewDiscoverService(db *gorm.DB, echo *echotik.Client, store *storage.Storage, llmc *llm.Client, enrichMinSale int) *DiscoverService {
	return &DiscoverService{
		db:                db,
		echo:              echo,
		storage:           store,
		llm:               llmc,
		enrichMinSale:     enrichMinSale,
		coverHTTP:         &http.Client{Timeout: 30 * time.Second},
		rehostCh:          make(chan []string, 256),
		rehostInflight:    make(map[string]struct{}),
		translateCh:       make(chan []translateJob, 256),
		translateInflight: make(map[string]struct{}),
	}
}

// DecoratedProduct 给前端发现页用:商品 + 是否已收藏(已收藏 = 已落进选品 products 表)。
type DecoratedProduct struct {
	ProductID         string   `json:"productId"` // EchoTik external id
	Name              string   `json:"name"`
	NameZh            string   `json:"nameZh"` // 中文译文,空=尚未翻译(前端退回原文)
	Region            string   `json:"region"`
	AvgPriceCents     int      `json:"avgPriceCents"`
	MinPriceCents     int      `json:"minPriceCents"`
	MaxPriceCents     int      `json:"maxPriceCents"`
	CommissionRate    float64  `json:"commissionRate"`
	TotalSaleCnt      int      `json:"totalSaleCnt"`
	TotalSaleGmvCents int      `json:"totalSaleGmvCents"`
	Sale7dCnt         int      `json:"sale7dCnt"`  // 近 7 天销量(EchoTik 官方口径);0=暂无数据
	Sale30dCnt        int      `json:"sale30dCnt"` // 近 30 天销量
	Gmv7dCents        int      `json:"gmv7dCents"` // 近 7 天 GMV(分);0=暂无数据
	Gmv30dCents       int      `json:"gmv30dCents"`
	Spark7d           []int    `json:"spark7d"` // 近 7 天日销量增量(快照差分,oldest→newest);<2 点不足以画线
	TotalIflCnt       int      `json:"totalIflCnt"`
	TotalVideoCnt     int      `json:"totalVideoCnt"`
	CoverUrls         []string `json:"coverUrls"`
	ImportedProductID *string  `json:"importedProductId"`
}

type RanklistResult struct {
	State     string             `json:"state"` // live | cached | empty | error
	FetchedAt *time.Time         `json:"fetchedAt,omitempty"`
	Warming   bool               `json:"warming,omitempty"` // 当前返回为空/部分,已触发后台异步补全,前端可稍后重取
	Products  []DecoratedProduct `json:"products"`
}

// defaultRanklistDepth 冷启动/定时预热默认拉取的页数(让默认榜前几页开机即可本地翻页)。
const defaultRanklistDepth = 3

// Ranklist 取榜单:读路径**零同步 EchoTik**。读本地 DB(顺序表 + 主表),按页切片;
// miss/陈旧/请求页超出已存深度 → goRefresh 后台异步拉取落库,当前请求按"库存为准"返回
// (可能为空 + warming);EchoTik 未配置时返回空态,不阻塞、不在请求内打跨境接口。
func (s *DiscoverService) Ranklist(ctx context.Context, wsID uuid.UUID, p echotik.RanklistParams) (*RanklistResult, error) {
	if p.PageSize <= 0 {
		p.PageSize = 10
	}
	// 带关键词=搜索:走独立路径(DB-first)。
	if p.Keyword != "" {
		return s.searchProducts(ctx, wsID, p), nil
	}

	// ── 类目筛选:本地按累计销量分页;后台异步拉深保鲜。 ──
	if p.CategoryID != "" {
		if s.echo.Configured() {
			goRefresh(ctx, "ranklist-category", func(bg context.Context) {
				if _, e := s.RefreshRanklistDeep(bg, p, p.PageNum); e != nil {
					logger.Warn("类目商品榜后台刷新失败", logger.String("cat", p.CategoryID), logger.Err(e))
				}
			})
		}
		if dps, ok := s.lookupProductsByCategory(ctx, p); ok {
			return &RanklistResult{State: "cached", Products: s.decorate(ctx, wsID, dps)}, nil
		}
		if !s.echo.Configured() {
			return &RanklistResult{State: "empty", Products: []DecoratedProduct{}}, nil
		}
		return &RanklistResult{State: "cached", Warming: true, Products: []DecoratedProduct{}}, nil
	}

	// ── 默认榜:读顺序表 + 主表,按页切片;后台异步保鲜/拉深。 ──
	if ids, fetchedAt, ok := s.lookupCacheIDs(ctx, p); ok {
		pageIDs := pageSlice(ids, p.PageNum, p.PageSize)
		if s.echo.Configured() {
			stale := time.Since(fetchedAt) > cacheTTL
			beyond := len(pageIDs) == 0 && p.PageNum > 1 // 请求页超出已存深度 → 拉深
			if stale || beyond {
				depth := p.PageNum
				if depth < defaultRanklistDepth {
					depth = defaultRanklistDepth
				}
				goRefresh(ctx, "ranklist", func(bg context.Context) {
					if _, e := s.RefreshRanklistDeep(bg, p, depth); e != nil {
						logger.Warn("商品榜后台刷新失败", logger.String("region", p.Region), logger.Err(e))
					}
				})
			}
		}
		dps := s.loadProductsOrdered(ctx, p.Region, pageIDs)
		fa := fetchedAt
		return &RanklistResult{State: "cached", FetchedAt: &fa, Warming: len(dps) == 0 && s.echo.Configured(), Products: s.decorate(ctx, wsID, dps)}, nil
	}

	// ── 冷启动(顺序表为空)。 ──
	if !s.echo.Configured() {
		return &RanklistResult{State: "empty", Products: []DecoratedProduct{}}, nil
	}
	goRefresh(ctx, "ranklist-cold", func(bg context.Context) {
		if _, e := s.RefreshRanklistDeep(bg, p, defaultRanklistDepth); e != nil {
			logger.Warn("商品榜冷启动后台拉取失败", logger.String("region", p.Region), logger.Err(e))
		}
	})
	return &RanklistResult{State: "cached", Warming: true, Products: []DecoratedProduct{}}, nil
}

// searchProducts 关键词搜商品:**DB-first**。先返回已落库商品的本地 ILIKE 匹配(零 EchoTik),
// 再 goRefresh 后台用 echo.SearchProducts 拉取落库供下次;本地无结果且 echo 已配置时返回空+warming。
func (s *DiscoverService) searchProducts(ctx context.Context, wsID uuid.UUID, p echotik.RanklistParams) *RanklistResult {
	if s.echo.Configured() {
		goRefresh(ctx, "search-products", func(bg context.Context) { s.warmSearchProducts(bg, p) })
	}
	if dps, ok := s.searchLocalProducts(ctx, p); ok {
		return &RanklistResult{State: "cached", Products: s.decorate(ctx, wsID, dps)}
	}
	if !s.echo.Configured() {
		return &RanklistResult{State: "empty", Products: []DecoratedProduct{}}
	}
	return &RanklistResult{State: "cached", Warming: true, Products: []DecoratedProduct{}}
}

// warmSearchProducts 后台拉取搜索结果并落库(支持下次本地命中 + 收藏/导入)。
func (s *DiscoverService) warmSearchProducts(ctx context.Context, p echotik.RanklistParams) {
	rows, err := s.echo.SearchProducts(ctx, p.Keyword, p.Region, p.PageSize)
	if err != nil {
		logger.Warn("选品搜索后台拉取失败", logger.String("keyword", p.Keyword), logger.Err(err))
		return
	}
	// 搜索响应可能回 priority_region 而非 region,导致行 region 为空;回填查询 region(详情链接/落库要用)。
	for i := range rows {
		if rows[i].Region == "" {
			rows[i].Region = p.Region
		}
	}
	s.persist(ctx, p, rows, false, false, true, false) // 不写顺序/快照,补封面;用户主动搜的商品不设销量门槛
}

// RefreshRanklist 强制拉取单页并落库(定时预热 / 现场兜底):跳过缓存检查、不做工作台装饰。
// 走 persist 既有路径,刷新后用户请求命中缓存。返回落库条数。多页累积见 RefreshRanklistDeep。
func (s *DiscoverService) RefreshRanklist(ctx context.Context, p echotik.RanklistParams) (int, error) {
	if !s.echo.Configured() {
		return 0, errors.New("echotik 未配置")
	}
	if p.PageSize <= 0 {
		p.PageSize = 10
	}
	raw, err := s.echo.GetProductRanklist(ctx, p)
	if err != nil {
		return 0, err
	}
	writeDefault := p.CategoryID == ""
	dps := s.persist(ctx, p, raw, writeDefault, writeDefault, writeDefault, true)
	return len(dps), nil
}

// RefreshRanklistDeep 拉取榜单前 upto 页并累积落库:商品+封面+快照逐页 upsert;
// 默认榜(无类目)把所有页 ID 去重累积后统一写一条顺序表(供翻页切片)。类目榜只落主表
// (读路径走 lookupProductsByCategory)。供定时预热 / 冷启动 / 翻页拉深。
func (s *DiscoverService) RefreshRanklistDeep(ctx context.Context, p echotik.RanklistParams, upto int) (int, error) {
	if !s.echo.Configured() {
		return 0, errors.New("echotik 未配置")
	}
	if p.PageSize <= 0 {
		p.PageSize = 10
	}
	if upto < 1 {
		upto = 1
	}
	writeDefault := p.CategoryID == "" // 仅默认榜累积顺序表/写快照
	var allIDs []string
	seen := make(map[string]struct{})
	total := 0
	for page := 1; page <= upto; page++ {
		pp := p
		pp.PageNum = page
		raw, err := s.echo.GetProductRanklist(ctx, pp)
		if err != nil {
			if page == 1 {
				return total, err
			}
			break // 部分深度可接受
		}
		if len(raw) == 0 {
			break
		}
		// 逐页落库:商品 + 快照(默认榜) + 封面;顺序表累积后统一写。后台预热路径启用销量门槛。
		dps := s.persist(ctx, pp, raw, writeDefault, false, true, true)
		total += len(dps)
		for _, d := range dps {
			if _, dup := seen[d.ExternalID]; !dup {
				seen[d.ExternalID] = struct{}{}
				allIDs = append(allIDs, d.ExternalID)
			}
		}
		if len(raw) < p.PageSize {
			break // 不足一页=没有更多
		}
	}
	if writeDefault && len(allIDs) > 0 {
		s.writeRanklistEntry(ctx, p, allIDs)
	}
	return total, nil
}

// writeRanklistEntry upsert 一条商品榜顺序((provider,region,rank_type,rank_field) 幂等)。
func (s *DiscoverService) writeRanklistEntry(ctx context.Context, p echotik.RanklistParams, ids []string) {
	if s.db == nil || len(ids) == 0 {
		return
	}
	entry := model.RanklistCacheEntry{
		Provider: providerEchoTik, Region: p.Region, RankType: p.RankType, RankField: p.RankField,
		Date: time.Now().Format("2006-01-02"), ExternalIDs: ids, FetchedAt: time.Now(),
	}
	s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "provider"}, {Name: "region"}, {Name: "rank_type"}, {Name: "rank_field"}},
		DoUpdates: clause.AssignmentColumns([]string{"date", "external_ids", "fetched_at"}),
	}).Create(&entry)
}

// pageSlice 取 ids 的第 pageNum 页(1-based)、每页 pageSize 条;越界返回空。
func pageSlice(ids []string, pageNum, pageSize int) []string {
	if pageSize <= 0 {
		return ids
	}
	if pageNum <= 0 {
		pageNum = 1
	}
	start := (pageNum - 1) * pageSize
	if start >= len(ids) {
		return nil
	}
	end := start + pageSize
	if end > len(ids) {
		end = len(ids)
	}
	return ids[start:end]
}

// lookupCacheIDs 读商品榜顺序表的 ID 列表(不看 TTL,有就用);新鲜度由后台刷新与定时 job 保证。
func (s *DiscoverService) lookupCacheIDs(ctx context.Context, p echotik.RanklistParams) ([]string, time.Time, bool) {
	var entry model.RanklistCacheEntry
	err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND rank_type = ? AND rank_field = ?",
			providerEchoTik, p.Region, p.RankType, p.RankField).
		First(&entry).Error
	if err != nil || len(entry.ExternalIDs) == 0 {
		return nil, time.Time{}, false
	}
	return entry.ExternalIDs, entry.FetchedAt, true
}

// loadProductsOrdered 按给定 ID 顺序从主表取商品(缺失的跳过)。
func (s *DiscoverService) loadProductsOrdered(ctx context.Context, region string, ids []string) []model.DiscoverProduct {
	if len(ids) == 0 {
		return nil
	}
	var dps []model.DiscoverProduct
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, region, ids).
		Find(&dps).Error; err != nil {
		return nil
	}
	byID := make(map[string]model.DiscoverProduct, len(dps))
	for _, d := range dps {
		byID[d.ExternalID] = d
	}
	ordered := make([]model.DiscoverProduct, 0, len(ids))
	for _, id := range ids {
		if d, ok := byID[id]; ok {
			ordered = append(ordered, d)
		}
	}
	return ordered
}

// lookupProductsByCategory 本地按类目取商品榜(累计销量降序,按页 offset)。数据足够时类目筛选零 EchoTik。
func (s *DiscoverService) lookupProductsByCategory(ctx context.Context, p echotik.RanklistParams) ([]model.DiscoverProduct, bool) {
	if s.db == nil {
		return nil, false
	}
	offset := 0
	if p.PageNum > 1 {
		offset = (p.PageNum - 1) * p.PageSize
	}
	var dps []model.DiscoverProduct
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND category_id = ?", providerEchoTik, p.Region, p.CategoryID).
		Order("total_sale_cnt DESC").Offset(offset).Limit(p.PageSize).Find(&dps).Error; err != nil || len(dps) == 0 {
		return nil, false
	}
	return dps, true
}

// persist 落库 DiscoverProduct(永远 upsert,支持导入);writeSnapshot 控制是否写每日快照(趋势源),
// writeCacheEntry 控制是否写榜单顺序表(单页路径用;多页累积走 RefreshRanklistDeep+writeRanklistEntry),
// enrichCover 控制是否补取详情(封面+近窗字段,与缓存解耦,搜索 live 也补)。
// gateEnrich=true(后台同步/预热路径)时启用入库销量门槛:累计销量 < enrichMinSale 的商品
// 整条跳过——不入库、不写快照、不请求详情、不投翻译,也不进榜单顺序表(返回值即不含它们);
// 销量涨过门槛后下一轮自然入库。用户触发路径传 false 不设限。
func (s *DiscoverService) persist(ctx context.Context, p echotik.RanklistParams, raw []echotik.ProductListItem, writeSnapshot, writeCacheEntry, enrichCover, gateEnrich bool) []model.DiscoverProduct {
	if gateEnrich && s.enrichMinSale > 0 {
		kept := make([]echotik.ProductListItem, 0, len(raw))
		for _, it := range raw {
			if it.TotalSaleCnt >= s.enrichMinSale {
				kept = append(kept, it)
			}
		}
		if skipped := len(raw) - len(kept); skipped > 0 {
			logger.Info("发现页入库门槛生效,低销量商品整条跳过",
				logger.String("region", p.Region), logger.Int("skipped", skipped),
				logger.Int("minSale", s.enrichMinSale))
		}
		raw = kept
	}

	today := time.Now().Format("2006-01-02")
	out := make([]model.DiscoverProduct, 0, len(raw))
	externalIDs := make([]string, 0, len(raw))
	var transJobs []translateJob // 待翻译商品标题(name_zh 空),事务后统一投递

	// 商品榜接口不带封面/窗口;仅 live 拉取时调详情接口补取。
	// 同一次详情调用顺带带回近 7/30 天窗口,persist 时零新增调用写进主表。
	var coverByID map[string]model.JSONB
	var detailByID map[string]echotik.ProductDetail
	if enrichCover {
		coverByID, detailByID = s.enrichDetails(ctx, p.Region, raw)
	}

	_ = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, it := range raw {
			dp := model.DiscoverProduct{
				Provider:       providerEchoTik,
				ExternalID:     it.ProductID,
				Region:         p.Region,
				Name:           it.ProductName,
				CategoryID:     it.CategoryID,
				CategoryL2ID:   it.CategoryL2ID,
				CategoryL3ID:   it.CategoryL3ID,
				MinPriceCents:  echotik.DollarsToCents(it.MinPrice),
				MaxPriceCents:  echotik.DollarsToCents(it.MaxPrice),
				AvgPriceCents:  echotik.DollarsToCents(it.SpuAvgPrice),
				CommissionRate: it.ProductCommissionRate,
				TotalSaleCnt:   it.TotalSaleCnt,
				TotalSaleGmv:   echotik.DollarsToCents(it.TotalSaleGmvAmt),
				TotalIflCnt:    it.TotalIflCnt,
				TotalVideoCnt:  it.TotalVideoCnt,
				TotalLiveCnt:   it.TotalLiveCnt,
				LastFetchedAt:  time.Now(),
			}
			updateCols := []string{
				"name", "category_id", "category_l2_id", "category_l3_id",
				"min_price_cents", "max_price_cents", "avg_price_cents", "commission_rate",
				"total_sale_cnt", "total_sale_gmv", "total_ifl_cnt", "total_video_cnt", "total_live_cnt",
				"last_fetched_at", "updated_at",
			}
			// 只在本轮拿到封面时才更新 cover_urls,否则保留库里既有值(避免签名失败把旧图清空)。
			if cov, ok := coverByID[it.ProductID]; ok && len(cov) > 0 {
				dp.CoverUrls = cov
				updateCols = append(updateCols, "cover_urls")
			}
			// 近窗销量同理:仅本轮取到详情才更新,未取到(门槛拦截/上游失败)保留旧值。
			if d, ok := detailByID[it.ProductID]; ok {
				dp.Sale7dCnt = d.TotalSale7dCnt.Int()
				dp.Sale30dCnt = d.TotalSale30dCnt.Int()
				dp.Gmv7dCents = echotik.DollarsToCents(d.TotalSaleGmv7dAmt.Float())
				dp.Gmv30dCents = echotik.DollarsToCents(d.TotalSaleGmv30dAmt.Float())
				updateCols = append(updateCols, "sale7d_cnt", "sale30d_cnt", "gmv7d_cents", "gmv30d_cents")
			}

			// upsert by (provider, external_id, region)
			tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
				DoUpdates: clause.AssignmentColumns(updateCols),
			}).Create(&dp)

			// 取回带 ID 的行(OnConflict 时 dp.ID 可能为新生成而非库内既有,统一回查)。
			var stored model.DiscoverProduct
			if err := tx.Where("provider = ? AND external_id = ? AND region = ?",
				providerEchoTik, it.ProductID, p.Region).First(&stored).Error; err != nil {
				continue
			}
			out = append(out, stored)
			externalIDs = append(externalIDs, it.ProductID)

			// product/detail 标量整包顺带落进 detail_extras(零新增调用):评分/描述/窗口/
			// 权威累计值 + 图廊原文 URL。详情页读到即渲染,还能跳过自己的 detail 调用;
			// 已 rehost 的图廊(Gallery)保留不覆盖,同步路径不下图。
			if d, ok := detailByID[it.ProductID]; ok {
				ex := extrasFromDetail(&d)
				if old := parseProductExtras(stored.DetailExtras); old != nil && len(old.Gallery) > 0 {
					ex.Gallery = old.Gallery
				}
				if b, e := json.Marshal(ex); e == nil {
					tx.Model(&model.DiscoverProduct{}).Where("id = ?", stored.ID).
						Updates(map[string]any{"detail_extras": model.JSONB(b), "detail_extras_at": time.Now()})
				}
			}
			// 标题外文本地化:仅补空、不覆盖既有译文(与视频文案同一 worker 批量翻译回填)。
			if stored.NameZh == "" && stored.Name != "" {
				transJobs = append(transJobs, translateJob{Table: "discover_products", Column: "name_zh", ID: stored.ID, Text: stored.Name})
			}

			if writeSnapshot {
				snap := model.DiscoverSnapshot{
					DiscoverProductID: stored.ID, Dt: today,
					TotalSaleCnt: it.TotalSaleCnt, TotalSaleGmv: echotik.DollarsToCents(it.TotalSaleGmvAmt),
					TotalIflCnt: it.TotalIflCnt, TotalVideoCnt: it.TotalVideoCnt, TotalLiveCnt: it.TotalLiveCnt,
				}
				tx.Clauses(clause.OnConflict{
					Columns:   []clause.Column{{Name: "discover_product_id"}, {Name: "dt"}},
					DoUpdates: clause.AssignmentColumns([]string{"total_sale_cnt", "total_sale_gmv", "total_ifl_cnt", "total_video_cnt", "total_live_cnt"}),
				}).Create(&snap)
			}
		}

		if writeCacheEntry && len(externalIDs) > 0 {
			entry := model.RanklistCacheEntry{
				Provider: providerEchoTik, Region: p.Region, RankType: p.RankType, RankField: p.RankField,
				Date: today, ExternalIDs: externalIDs, FetchedAt: time.Now(),
			}
			tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "provider"}, {Name: "region"}, {Name: "rank_type"}, {Name: "rank_field"}},
				DoUpdates: clause.AssignmentColumns([]string{"date", "external_ids", "fetched_at"}),
			}).Create(&entry)
		}
		return nil
	})
	s.enqueueTranslate(transJobs)
	return out
}

func (s *DiscoverService) decorate(ctx context.Context, wsID uuid.UUID, dps []model.DiscoverProduct) []DecoratedProduct {
	if len(dps) == 0 {
		return []DecoratedProduct{}
	}
	ids := make([]uuid.UUID, 0, len(dps))
	for _, d := range dps {
		ids = append(ids, d.ID)
	}

	// 游客(wsID == Nil)没有工作台,跳过「已导入/已收藏」个性化浮层,只回公共榜单。
	importedBy := map[uuid.UUID]string{}
	if wsID != uuid.Nil {
		var prods []model.Product
		s.db.WithContext(ctx).
			Where("workspace_id = ? AND discover_product_id IN ?", wsID, ids).
			Find(&prods)
		for _, p := range prods {
			if p.DiscoverProductID != nil {
				importedBy[*p.DiscoverProductID] = p.ID.String()
			}
		}
	}

	sparks := s.loadSaleSparks(ctx, ids)

	out := make([]DecoratedProduct, 0, len(dps))
	for _, d := range dps {
		dp := DecoratedProduct{
			ProductID: d.ExternalID, Name: d.Name, NameZh: d.NameZh, Region: d.Region,
			AvgPriceCents: d.AvgPriceCents, MinPriceCents: d.MinPriceCents, MaxPriceCents: d.MaxPriceCents,
			CommissionRate: d.CommissionRate, TotalSaleCnt: d.TotalSaleCnt, TotalSaleGmvCents: d.TotalSaleGmv,
			Sale7dCnt: d.Sale7dCnt, Sale30dCnt: d.Sale30dCnt,
			Gmv7dCents: d.Gmv7dCents, Gmv30dCents: d.Gmv30dCents,
			Spark7d:     sparks[d.ID],
			TotalIflCnt: d.TotalIflCnt, TotalVideoCnt: d.TotalVideoCnt,
			CoverUrls: parseCovers(d.CoverUrls),
		}
		if dp.Spark7d == nil {
			dp.Spark7d = []int{}
		}
		if pid, ok := importedBy[d.ID]; ok {
			dp.ImportedProductID = &pid
		}
		out = append(out, dp)
	}
	return out
}

// loadSaleSparks 批量取每商品最近 8 天快照并差分成日销量增量序列(oldest→newest,最多 7 点),
// 供列表迷你趋势线。与详情页 productTrendFromSnapshots 同源同口径,只是限窗 + 批量。
func (s *DiscoverService) loadSaleSparks(ctx context.Context, ids []uuid.UUID) map[uuid.UUID][]int {
	out := map[uuid.UUID][]int{}
	if s.db == nil || len(ids) == 0 {
		return out
	}
	cutoff := time.Now().AddDate(0, 0, -8).Format("2006-01-02")
	var snaps []model.DiscoverSnapshot
	if err := s.db.WithContext(ctx).
		Where("discover_product_id IN ? AND dt >= ?", ids, cutoff).
		Order("dt asc").Find(&snaps).Error; err != nil {
		return out
	}
	grouped := map[uuid.UUID][]model.DiscoverSnapshot{}
	for _, sn := range snaps {
		grouped[sn.DiscoverProductID] = append(grouped[sn.DiscoverProductID], sn)
	}
	for id, g := range grouped {
		if len(g) < 2 {
			continue // 单点差分不出增量,前端按无数据处理
		}
		pts := make([]int, 0, len(g)-1)
		for i := 1; i < len(g); i++ {
			pts = append(pts, nonNeg(g[i].TotalSaleCnt-g[i-1].TotalSaleCnt))
		}
		out[id] = pts
	}
	return out
}

// enrichDetails 批量取商品详情:封面永久化 + 完整详情透传。
// 返回 covers: productID -> JSONB([]string{permanentURL});details: productID -> 完整 ProductDetail
// (persist 顺带把近窗字段落主表 + detail 标量整包落 detail_extras,同一次详情调用不多花一分钱)。
// 封面流程:product/detail 拿防盗链原文 → rehostCovers 下载并转存 COS(永久,失败回退 3 天签名 URL)。
// 前端只显示 coverUrls[0],故每个商品只处理首图,省接口调用。
// 任一步出错只影响封面(降级为占位图),不阻断榜单返回。
func (s *DiscoverService) enrichDetails(ctx context.Context, region string, raw []echotik.ProductListItem) (covers map[string]model.JSONB, details map[string]echotik.ProductDetail) {
	covers = map[string]model.JSONB{}
	if len(raw) == 0 || !s.echo.Configured() {
		return covers, nil
	}

	ids := make([]string, 0, len(raw))
	for _, it := range raw {
		ids = append(ids, it.ProductID)
	}

	details, err := s.echo.GetProductDetailMap(ctx, ids, region)
	if err != nil {
		// 部分批次失败:已拿到的详情照常用,缺的商品降级占位图/留旧值。
		logger.Warn("发现页取详情部分失败", logger.String("region", region),
			logger.Int("got", len(details)), logger.Int("want", len(ids)), logger.Err(err))
	}

	// 收集每个商品的首图原文,批量签名。
	firstRaw := make(map[string]string, len(details))
	rawList := make([]string, 0, len(details))
	for pid, d := range details {
		cvs := echotik.ParseCovers(d.CoverURL)
		if len(cvs) == 0 {
			continue
		}
		firstRaw[pid] = cvs[0].URL
		rawList = append(rawList, cvs[0].URL)
	}
	if len(rawList) == 0 {
		return covers, details
	}

	rehosted := s.rehostCovers(ctx, rawList)
	for pid, rawURL := range firstRaw {
		su, ok := rehosted[rawURL]
		if !ok {
			continue
		}
		b, e := json.Marshal([]string{su})
		if e != nil {
			continue
		}
		covers[pid] = model.JSONB(b)
	}
	return covers, details
}

func parseCovers(raw model.JSONB) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var urls []string
	if err := json.Unmarshal(raw, &urls); err == nil {
		return urls
	}
	return []string{}
}

// ImportProduct 把已缓存的 EchoTik 商品导入为本地 Product(去重)。
type ImportResult struct {
	Product       *model.Product `json:"product"`
	AlreadyExists bool           `json:"alreadyExists"`
}

func (s *DiscoverService) ImportProduct(ctx context.Context, wsID uuid.UUID, externalID, region, categoryLabel, status string) (*ImportResult, error) {
	dp, err := s.findDiscover(ctx, externalID, region)
	if err != nil {
		return nil, err
	}
	// 去重:同工作台 + 同 discover product。
	var existing model.Product
	e := s.db.WithContext(ctx).
		Where("workspace_id = ? AND discover_product_id = ?", wsID, dp.ID).
		First(&existing).Error
	if e == nil {
		return &ImportResult{Product: &existing, AlreadyExists: true}, nil
	}
	if !errors.Is(e, gorm.ErrRecordNotFound) {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询商品失败", e)
	}

	if categoryLabel == "" {
		categoryLabel = "TikTok Shop 爆品"
	}
	if status == "" {
		status = model.ProductEvaluating
	}
	priceCents := dp.AvgPriceCents
	costCents := echotik.EstimateLandedCost(priceCents, dp.Name, dp.Region).TotalCents
	emoji := echotik.GuessEmoji(dp.Name)
	dpID := dp.ID
	note := "来自 EchoTik · 区域 " + dp.Region
	p := model.Product{
		WorkspaceID:       wsID,
		DiscoverProductID: &dpID,
		Title:             dp.Name,
		Category:          categoryLabel,
		Emoji:             &emoji,
		PriceCents:        priceCents,
		CostCents:         costCents,
		CostSource:        model.CostSourceEstimate,
		MarginPct:         echotik.EstimateMarginPct(priceCents, costCents),
		RoiScore:          echotik.RoiScore(dp.TotalSaleCnt, dp.TotalIflCnt),
		MonthlySales:      dp.TotalSaleCnt,
		Status:            status,
		Note:              &note,
	}
	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "导入商品失败", err)
	}
	return &ImportResult{Product: &p, AlreadyExists: false}, nil
}

func (s *DiscoverService) findDiscover(ctx context.Context, externalID, region string) (*model.DiscoverProduct, error) {
	var dp model.DiscoverProduct
	err := s.db.WithContext(ctx).
		Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, externalID, region).
		First(&dp).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("商品不存在,请先在发现页加载榜单")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询商品失败", err)
	}
	return &dp, nil
}

// MigrateStarredToProducts 一次性迁移:把旧的商品收藏(interactions.is_starred=true)
// 搬成选品 products 表里的候选记录。复用 ImportProduct 去重,已存在则跳过。
func (s *DiscoverService) MigrateStarredToProducts(ctx context.Context) (migrated, skipped int, err error) {
	var inters []model.WorkspaceDiscoverInteraction
	if e := s.db.WithContext(ctx).Where("is_starred = ?", true).Find(&inters).Error; e != nil {
		return 0, 0, e
	}
	for _, it := range inters {
		var dp model.DiscoverProduct
		if e := s.db.WithContext(ctx).Where("id = ?", it.DiscoverProductID).First(&dp).Error; e != nil {
			continue // discover 商品已不在缓存,跳过
		}
		res, e := s.ImportProduct(ctx, it.WorkspaceID, dp.ExternalID, dp.Region, "", model.ProductCandidate)
		if e != nil {
			return migrated, skipped, e
		}
		if res.AlreadyExists {
			skipped++
		} else {
			migrated++
		}
	}
	return migrated, skipped, nil
}
