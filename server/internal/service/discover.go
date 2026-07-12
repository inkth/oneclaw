package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
	"github.com/faxianmao/server/internal/storage"
)

const (
	providerEchoTik = "echotik"
	cacheTTL        = 6 * time.Hour
)

type DiscoverService struct {
	db        *gorm.DB
	echo      *echotik.Client
	storage   *storage.Storage
	coverHTTP *http.Client
}

func NewDiscoverService(db *gorm.DB, echo *echotik.Client, store *storage.Storage) *DiscoverService {
	return &DiscoverService{
		db:        db,
		echo:      echo,
		storage:   store,
		coverHTTP: &http.Client{Timeout: 30 * time.Second},
	}
}

// DecoratedProduct 给前端发现页用:商品 + 是否已收藏(已收藏 = 已落进选品 products 表)。
type DecoratedProduct struct {
	ProductID         string   `json:"productId"` // EchoTik external id
	Name              string   `json:"name"`
	Region            string   `json:"region"`
	AvgPriceCents     int      `json:"avgPriceCents"`
	MinPriceCents     int      `json:"minPriceCents"`
	MaxPriceCents     int      `json:"maxPriceCents"`
	CommissionRate    float64  `json:"commissionRate"`
	TotalSaleCnt      int      `json:"totalSaleCnt"`
	TotalSaleGmvCents int      `json:"totalSaleGmvCents"`
	TotalIflCnt       int      `json:"totalIflCnt"`
	TotalVideoCnt     int      `json:"totalVideoCnt"`
	CoverUrls         []string `json:"coverUrls"`
	ImportedProductID *string  `json:"importedProductId"`
}

type RanklistResult struct {
	State     string             `json:"state"` // live | cached | mock | error
	FetchedAt *time.Time         `json:"fetchedAt,omitempty"`
	Warming   bool               `json:"warming,omitempty"` // 当前返回为空/部分,已触发后台异步补全,前端可稍后重取
	Products  []DecoratedProduct `json:"products"`
}

// defaultRanklistDepth 冷启动/定时预热默认拉取的页数(让默认榜前几页开机即可本地翻页)。
const defaultRanklistDepth = 3

// Ranklist 取榜单:读路径**零同步 EchoTik**。读本地 DB(顺序表 + 主表),按页切片;
// miss/陈旧/请求页超出已存深度 → goRefresh 后台异步拉取落库,当前请求按"库存为准"返回
// (可能为空 + warming);EchoTik 未配置时回落 mock(开发演示),不阻塞、不在请求内打跨境接口。
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
			return s.mockRanklist(ctx, wsID, p), nil
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
		return s.mockRanklist(ctx, wsID, p), nil
	}
	goRefresh(ctx, "ranklist-cold", func(bg context.Context) {
		if _, e := s.RefreshRanklistDeep(bg, p, defaultRanklistDepth); e != nil {
			logger.Warn("商品榜冷启动后台拉取失败", logger.String("region", p.Region), logger.Err(e))
		}
	})
	return &RanklistResult{State: "cached", Warming: true, Products: []DecoratedProduct{}}, nil
}

// mockRanklist EchoTik 未配置时的开发兜底:用预置 mock 数据 upsert 进 DiscoverProduct
// (支持导入/收藏演示),不写榜单顺序/快照/封面。
func (s *DiscoverService) mockRanklist(ctx context.Context, wsID uuid.UUID, p echotik.RanklistParams) *RanklistResult {
	raw := echotik.MockRanklist(p.Region, p.PageSize)
	dps := s.persist(ctx, p, raw, false, false, false)
	return &RanklistResult{State: "mock", Products: s.decorate(ctx, wsID, dps)}
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
		raw := echotik.MockSearchProducts(p.Region, p.Keyword, p.PageSize)
		dps := s.persist(ctx, p, raw, false, false, false)
		return &RanklistResult{State: "mock", Products: s.decorate(ctx, wsID, dps)}
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
	s.persist(ctx, p, rows, false, false, true) // 不写顺序/快照,补封面
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
	dps := s.persist(ctx, p, raw, writeDefault, writeDefault, writeDefault)
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
		// 逐页落库:商品 + 快照(默认榜) + 封面;顺序表累积后统一写。
		dps := s.persist(ctx, pp, raw, writeDefault, false, true)
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
// enrichCover 控制是否补取封面(与缓存解耦,搜索 live 也补图)。
func (s *DiscoverService) persist(ctx context.Context, p echotik.RanklistParams, raw []echotik.ProductListItem, writeSnapshot, writeCacheEntry, enrichCover bool) []model.DiscoverProduct {
	today := time.Now().Format("2006-01-02")
	out := make([]model.DiscoverProduct, 0, len(raw))
	externalIDs := make([]string, 0, len(raw))

	// 商品榜接口不带封面;仅 live 拉取时补取并签名(防盗链),避免给 mock/error 数据空跑。
	var coverByID map[string]model.JSONB
	if enrichCover {
		coverByID = s.enrichCovers(ctx, p.Region, raw)
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

	out := make([]DecoratedProduct, 0, len(dps))
	for _, d := range dps {
		dp := DecoratedProduct{
			ProductID: d.ExternalID, Name: d.Name, Region: d.Region,
			AvgPriceCents: d.AvgPriceCents, MinPriceCents: d.MinPriceCents, MaxPriceCents: d.MaxPriceCents,
			CommissionRate: d.CommissionRate, TotalSaleCnt: d.TotalSaleCnt, TotalSaleGmvCents: d.TotalSaleGmv,
			TotalIflCnt: d.TotalIflCnt, TotalVideoCnt: d.TotalVideoCnt,
			CoverUrls: parseCovers(d.CoverUrls),
		}
		if pid, ok := importedBy[d.ID]; ok {
			dp.ImportedProductID = &pid
		}
		out = append(out, dp)
	}
	return out
}

// enrichCovers 取商品榜封面并永久化,返回 productID -> JSONB([]string{permanentURL})。
// 流程:product/detail 拿防盗链原文 → rehostCovers 下载并转存 COS(永久,失败回退 3 天签名 URL)。
// 前端只显示 coverUrls[0],故每个商品只处理首图,省接口调用。
// 任一步出错只影响封面(降级为占位图),不阻断榜单返回。
func (s *DiscoverService) enrichCovers(ctx context.Context, region string, raw []echotik.ProductListItem) map[string]model.JSONB {
	out := map[string]model.JSONB{}
	if len(raw) == 0 || !s.echo.Configured() {
		return out
	}

	ids := make([]string, 0, len(raw))
	for _, it := range raw {
		ids = append(ids, it.ProductID)
	}

	coversByID, err := s.echo.GetProductCovers(ctx, ids, region)
	if err != nil {
		logger.Warn("发现页封面取详情失败,降级占位图", logger.String("region", region), logger.Err(err))
		return out
	}

	// 收集每个商品的首图原文,批量签名。
	firstRaw := make(map[string]string, len(coversByID))
	rawList := make([]string, 0, len(coversByID))
	for pid, urls := range coversByID {
		if len(urls) == 0 {
			continue
		}
		firstRaw[pid] = urls[0]
		rawList = append(rawList, urls[0])
	}
	if len(rawList) == 0 {
		return out
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
		out[pid] = model.JSONB(b)
	}
	return out
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
