package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

const (
	providerEchoTik = "echotik"
	cacheTTL        = 6 * time.Hour
)

type DiscoverService struct {
	db   *gorm.DB
	echo *echotik.Client
}

func NewDiscoverService(db *gorm.DB, echo *echotik.Client) *DiscoverService {
	return &DiscoverService{db: db, echo: echo}
}

// DecoratedProduct 给前端发现页用:商品 + 是否已导入 + 工作台收藏/标签。
type DecoratedProduct struct {
	ProductID         string    `json:"productId"` // EchoTik external id
	Name              string    `json:"name"`
	Region            string    `json:"region"`
	AvgPriceCents     int       `json:"avgPriceCents"`
	MinPriceCents     int       `json:"minPriceCents"`
	MaxPriceCents     int       `json:"maxPriceCents"`
	CommissionRate    float64   `json:"commissionRate"`
	TotalSaleCnt      int       `json:"totalSaleCnt"`
	TotalSaleGmvCents int       `json:"totalSaleGmvCents"`
	TotalIflCnt       int       `json:"totalIflCnt"`
	TotalVideoCnt     int       `json:"totalVideoCnt"`
	CoverUrls         []string  `json:"coverUrls"`
	ImportedProductID *string   `json:"importedProductId"`
	Interaction       *interDTO `json:"interaction"`
}

type interDTO struct {
	IsStarred bool     `json:"isStarred"`
	Tags      []string `json:"tags"`
}

type RanklistResult struct {
	State     string             `json:"state"` // live | cached | mock | error
	FetchedAt *time.Time         `json:"fetchedAt,omitempty"`
	Products  []DecoratedProduct `json:"products"`
}

// Ranklist 取榜单(缓存优先),并按工作台装饰(已导入 / 收藏)。
func (s *DiscoverService) Ranklist(ctx context.Context, wsID uuid.UUID, p echotik.RanklistParams) (*RanklistResult, error) {
	if p.PageSize <= 0 {
		p.PageSize = 10
	}

	// 全局榜单缓存键不含 category,按类目筛选时绕过缓存(实时拉、不写缓存)。
	useCache := p.CategoryID == ""

	// 1. 缓存命中?
	if useCache {
		if dps, fetchedAt, ok := s.lookupCache(ctx, p); ok {
			return &RanklistResult{State: "cached", FetchedAt: &fetchedAt, Products: s.decorate(ctx, wsID, dps)}, nil
		}
	}

	// 2. 取数据源(live / mock)。
	state := "live"
	raw, err := s.fetchRaw(ctx, p)
	if err != nil {
		state = "error"
		raw = echotik.MockRanklist(p.Region, p.PageSize)
	} else if !s.echo.Configured() {
		state = "mock"
	}

	// 3. 落库(DiscoverProduct 永远 upsert,以支持导入;cache/snapshot 仅 live 且非类目筛选)。
	dps := s.persist(ctx, p, raw, state == "live" && useCache)
	var fetchedAt *time.Time
	if state == "live" {
		now := time.Now()
		fetchedAt = &now
	}
	return &RanklistResult{State: state, FetchedAt: fetchedAt, Products: s.decorate(ctx, wsID, dps)}, nil
}

func (s *DiscoverService) fetchRaw(ctx context.Context, p echotik.RanklistParams) ([]echotik.ProductListItem, error) {
	if !s.echo.Configured() {
		return echotik.MockRanklist(p.Region, p.PageSize), nil
	}
	return s.echo.GetProductRanklist(ctx, p)
}

func (s *DiscoverService) lookupCache(ctx context.Context, p echotik.RanklistParams) ([]model.DiscoverProduct, time.Time, bool) {
	var entry model.RanklistCacheEntry
	err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND rank_type = ? AND rank_field = ?",
			providerEchoTik, p.Region, p.RankType, p.RankField).
		First(&entry).Error
	if err != nil || time.Since(entry.FetchedAt) > cacheTTL || len(entry.ExternalIDs) == 0 {
		return nil, time.Time{}, false
	}
	var dps []model.DiscoverProduct
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, p.Region, entry.ExternalIDs).
		Find(&dps).Error; err != nil {
		return nil, time.Time{}, false
	}
	// 按缓存顺序排列。
	order := make(map[string]int, len(entry.ExternalIDs))
	for i, id := range entry.ExternalIDs {
		order[id] = i
	}
	ordered := make([]model.DiscoverProduct, 0, len(dps))
	byID := make(map[string]model.DiscoverProduct, len(dps))
	for _, d := range dps {
		byID[d.ExternalID] = d
	}
	for _, id := range entry.ExternalIDs {
		if d, ok := byID[id]; ok {
			ordered = append(ordered, d)
		}
	}
	if len(ordered) == 0 {
		ordered = dps
	}
	_ = order
	return ordered, entry.FetchedAt, true
}

func (s *DiscoverService) persist(ctx context.Context, p echotik.RanklistParams, raw []echotik.ProductListItem, writeCache bool) []model.DiscoverProduct {
	today := time.Now().Format("2006-01-02")
	out := make([]model.DiscoverProduct, 0, len(raw))
	externalIDs := make([]string, 0, len(raw))

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
			// upsert by (provider, external_id, region)
			tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"name", "category_id", "category_l2_id", "category_l3_id",
					"min_price_cents", "max_price_cents", "avg_price_cents", "commission_rate",
					"total_sale_cnt", "total_sale_gmv", "total_ifl_cnt", "total_video_cnt", "total_live_cnt",
					"last_fetched_at", "updated_at",
				}),
			}).Create(&dp)

			// 取回带 ID 的行(OnConflict 时 dp.ID 可能为新生成而非库内既有,统一回查)。
			var stored model.DiscoverProduct
			if err := tx.Where("provider = ? AND external_id = ? AND region = ?",
				providerEchoTik, it.ProductID, p.Region).First(&stored).Error; err != nil {
				continue
			}
			out = append(out, stored)
			externalIDs = append(externalIDs, it.ProductID)

			if writeCache {
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

		if writeCache && len(externalIDs) > 0 {
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
	interBy := map[uuid.UUID]model.WorkspaceDiscoverInteraction{}
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

		var inters []model.WorkspaceDiscoverInteraction
		s.db.WithContext(ctx).
			Where("workspace_id = ? AND discover_product_id IN ?", wsID, ids).
			Find(&inters)
		for _, it := range inters {
			interBy[it.DiscoverProductID] = it
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
		if it, ok := interBy[d.ID]; ok {
			dp.Interaction = &interDTO{IsStarred: it.IsStarred, Tags: it.Tags}
		}
		out = append(out, dp)
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

// UpsertInteraction 收藏/标签/备注。
type InteractionInput struct {
	ExternalID string    `json:"externalId" binding:"required"`
	Region     string    `json:"region" binding:"required"`
	IsStarred  *bool     `json:"isStarred"`
	Tags       *[]string `json:"tags"`
	Note       *string   `json:"note"`
}

func (s *DiscoverService) UpsertInteraction(ctx context.Context, wsID uuid.UUID, in InteractionInput) (*model.WorkspaceDiscoverInteraction, error) {
	dp, err := s.findDiscover(ctx, in.ExternalID, in.Region)
	if err != nil {
		return nil, err
	}
	var rec model.WorkspaceDiscoverInteraction
	err = s.db.WithContext(ctx).
		Where("workspace_id = ? AND discover_product_id = ?", wsID, dp.ID).
		First(&rec).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		rec = model.WorkspaceDiscoverInteraction{WorkspaceID: wsID, DiscoverProductID: dp.ID, Tags: []string{}}
	} else if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询收藏失败", err)
	}
	if in.IsStarred != nil {
		rec.IsStarred = *in.IsStarred
	}
	if in.Tags != nil {
		rec.Tags = *in.Tags
	}
	if in.Note != nil {
		rec.Note = in.Note
	}
	if rec.ID == uuid.Nil {
		if err := s.db.WithContext(ctx).Create(&rec).Error; err != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "保存收藏失败", err)
		}
	} else {
		if err := s.db.WithContext(ctx).Save(&rec).Error; err != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "保存收藏失败", err)
		}
	}
	return &rec, nil
}

// ImportProduct 把已缓存的 EchoTik 商品导入为本地 Product(去重)。
type ImportResult struct {
	Product       *model.Product `json:"product"`
	AlreadyExists bool           `json:"alreadyExists"`
}

func (s *DiscoverService) ImportProduct(ctx context.Context, wsID uuid.UUID, externalID, region, categoryLabel string) (*ImportResult, error) {
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
	priceCents := dp.AvgPriceCents
	costCents := echotik.EstimateCostCents(priceCents)
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
		MarginPct:         echotik.EstimateMarginPct(priceCents, costCents),
		RoiScore:          echotik.RoiScore(dp.TotalSaleCnt, dp.TotalIflCnt),
		MonthlySales:      dp.TotalSaleCnt,
		Status:            model.ProductEvaluating,
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

// GetDiscoverProduct 详情(P1 走 DB 缓存)。
func (s *DiscoverService) GetDiscoverProduct(ctx context.Context, externalID, region string) (*model.DiscoverProduct, error) {
	return s.findDiscover(ctx, externalID, region)
}
