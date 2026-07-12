package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// upsertSellerList 把店铺榜行落库(列表级,封面 rehost 到 COS 永久化)并写当日累计快照。
// 供定时任务/榜单冷启动调用。封面仅在 rehost 成功时更新,不清空既有;不碰 seller_link/products
// 等详情独有字段与 detail_fetched_at。categories 用榜单的 most_product_category_list(n=5,与详情同源)。
func (s *DiscoverService) upsertSellerList(ctx context.Context, region string, raw []echotik.SellerListItem) {
	if s.db == nil || len(raw) == 0 {
		return
	}
	covers := make([]string, 0, len(raw))
	for _, it := range raw {
		covers = append(covers, it.CoverURL)
	}
	hosted := s.rehostCovers(ctx, covers)
	today := time.Now().Format("2006-01-02")
	_ = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, it := range raw {
			if it.SellerID == "" {
				continue
			}
			catsJSON, _ := json.Marshal(parseCategoryNames(it.MostProductCategoryList, 5))
			ds := model.DiscoverSeller{
				Provider:      providerEchoTik,
				ExternalID:    it.SellerID,
				Region:        region,
				SellerName:    it.SellerName,
				Rating:        it.Rating.Float(),
				Categories:    model.JSONB(catsJSON),
				ProductCnt:    it.TotalProductCnt,
				SaleCnt:       it.TotalSaleCnt,
				SaleGmvCents:  echotik.DollarsToCents(it.TotalSaleGmvAmt),
				IflCnt:        it.TotalIflCnt,
				VideoCnt:      it.TotalVideoCnt,
				LiveCnt:       it.TotalLiveCnt,
				ListFetchedAt: time.Now(),
			}
			cols := []string{
				"seller_name", "rating", "categories", "product_cnt", "sale_cnt", "sale_gmv_cents",
				"ifl_cnt", "video_cnt", "live_cnt", "list_fetched_at", "updated_at",
			}
			if cos := hosted[it.CoverURL]; cos != "" {
				ds.CoverURL = cos
				cols = append(cols, "cover_url")
			}
			tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
				DoUpdates: clause.AssignmentColumns(cols),
			}).Create(&ds)

			var stored model.DiscoverSeller
			if err := tx.Where("provider = ? AND external_id = ? AND region = ?",
				providerEchoTik, it.SellerID, region).First(&stored).Error; err != nil {
				continue
			}
			snap := model.DiscoverSellerSnapshot{
				DiscoverSellerID: stored.ID, Dt: today,
				SaleCnt: it.TotalSaleCnt, GmvCents: echotik.DollarsToCents(it.TotalSaleGmvAmt),
			}
			tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_seller_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
		return nil
	})
}

// refreshSellerDetail 拉店铺详情 + 旗下商品,封面永久化到 COS,upsert 主表(详情级全字段)并写当日快照。
// 趋势不在此取(改本地快照差分)。
func (s *DiscoverService) refreshSellerDetail(ctx context.Context, sellerID, region string) (*SellerDetailDTO, error) {
	d, err := s.echo.GetSellerDetail(ctx, sellerID, region)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}
	products, _ := s.echo.GetSellerProducts(ctx, sellerID, region, 10)

	toHost := make([]string, 0, len(products)+1)
	toHost = append(toHost, d.CoverURL)
	prodRaw := make([]string, len(products))
	for i, pr := range products {
		prodRaw[i] = firstCoverURL(pr.CoverURL)
		toHost = append(toHost, prodRaw[i])
	}
	hosted := s.rehostCovers(ctx, toHost)
	host := func(raw string) string {
		if raw == "" {
			return ""
		}
		if u, ok := hosted[raw]; ok {
			return u
		}
		return raw
	}

	prods := make([]EntityProductDTO, 0, len(products))
	for i, pr := range products {
		prods = append(prods, EntityProductDTO{
			ProductID:      pr.ProductID,
			Name:           pr.ProductName,
			Cover:          host(prodRaw[i]),
			AvgPriceCents:  echotik.DollarsToCents(pr.MaxPrice.Float()),
			CommissionRate: pr.ProductCommissionRate.Float(),
			Rating:         pr.ProductRating.Float(),
		})
	}

	catsJSON, _ := json.Marshal(parseCategoryNames(d.MostProductCategoryList, 5))
	prodsJSON, _ := json.Marshal(prods)
	rawJSON, _ := json.Marshal(d)
	ds := model.DiscoverSeller{
		Provider:        providerEchoTik,
		ExternalID:      d.SellerID,
		Region:          region,
		SellerName:      d.SellerName,
		CoverURL:        host(d.CoverURL),
		Rating:          d.Rating.Float(),
		Categories:      model.JSONB(catsJSON),
		ProductCnt:      d.TotalProductCnt.Int(),
		SaleCnt:         d.TotalSaleCnt.Int(),
		SaleGmvCents:    echotik.DollarsToCents(d.TotalSaleGmvAmt.Float()),
		IflCnt:          d.TotalIflCnt.Int(),
		VideoCnt:        d.TotalVideoCnt.Int(),
		LiveCnt:         d.TotalLiveCnt.Int(),
		SellerLink:      d.SellerLink,
		AvgPriceCents:   echotik.DollarsToCents(d.SpuAvgPrice.Float()),
		Sale7dCnt:       d.TotalSale7dCnt.Int(),
		Sale30dCnt:      d.TotalSale30dCnt.Int(),
		Gmv7dCents:      echotik.DollarsToCents(d.TotalSaleGmv7dAmt.Float()),
		Gmv30dCents:     echotik.DollarsToCents(d.TotalSaleGmv30dAmt.Float()),
		Products:        model.JSONB(prodsJSON),
		Raw:             model.JSONB(rawJSON),
		ListFetchedAt:   time.Now(),
		DetailFetchedAt: time.Now(),
	}

	target := ds
	if s.db != nil {
		s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"seller_name", "cover_url", "rating", "categories", "product_cnt", "sale_cnt", "sale_gmv_cents",
				"ifl_cnt", "video_cnt", "live_cnt", "seller_link", "avg_price_cents",
				"sale7d_cnt", "sale30d_cnt", "gmv7d_cents", "gmv30d_cents",
				"products", "raw", "list_fetched_at", "detail_fetched_at", "updated_at",
			}),
		}).Create(&ds)

		var stored model.DiscoverSeller
		if e := s.db.WithContext(ctx).Where("provider = ? AND external_id = ? AND region = ?",
			providerEchoTik, d.SellerID, region).First(&stored).Error; e == nil {
			target = stored
			today := time.Now().Format("2006-01-02")
			snap := model.DiscoverSellerSnapshot{
				DiscoverSellerID: stored.ID, Dt: today,
				SaleCnt: ds.SaleCnt, GmvCents: ds.SaleGmvCents,
			}
			s.db.WithContext(ctx).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_seller_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
	}
	return s.sellerDTOFromModel(ctx, &target), nil
}

// sellerDTOFromModel 用 DB 行(含 Products JSONB)+ 本地快照差分趋势组装详情 DTO,零 API。
func (s *DiscoverService) sellerDTOFromModel(ctx context.Context, ds *model.DiscoverSeller) *SellerDetailDTO {
	return &SellerDetailDTO{
		SellerID:          ds.ExternalID,
		SellerName:        ds.SellerName,
		Region:            ds.Region,
		Cover:             ds.CoverURL,
		SellerLink:        ds.SellerLink,
		Rating:            ds.Rating,
		Categories:        parseCategories(ds.Categories),
		AvgPriceCents:     ds.AvgPriceCents,
		TotalProductCnt:   ds.ProductCnt,
		TotalSaleCnt:      ds.SaleCnt,
		TotalSaleGmvCents: ds.SaleGmvCents,
		TotalIflCnt:       ds.IflCnt,
		TotalVideoCnt:     ds.VideoCnt,
		TotalLiveCnt:      ds.LiveCnt,
		Windows: &EntityWindowsDTO{
			Sale7dCnt:   ds.Sale7dCnt,
			Sale30dCnt:  ds.Sale30dCnt,
			Gmv7dCents:  ds.Gmv7dCents,
			Gmv30dCents: ds.Gmv30dCents,
		},
		Products: parseEntityProducts(ds.Products),
		Trend:    s.sellerTrendFromSnapshots(ctx, ds.ID),
	}
}

func (s *DiscoverService) sellerTrendFromSnapshots(ctx context.Context, id uuid.UUID) []TrendPointDTO {
	if s.db == nil || id == uuid.Nil {
		return []TrendPointDTO{}
	}
	var snaps []model.DiscoverSellerSnapshot
	if err := s.db.WithContext(ctx).
		Where("discover_seller_id = ?", id).
		Order("dt asc").Find(&snaps).Error; err != nil {
		return []TrendPointDTO{}
	}
	return diffSellerTrend(snaps)
}

// diffSellerTrend 把按 dt 升序的累计快照差分成趋势点(纯函数)。SaleCnt/GmvCents 为日增量,
// 首点无前值留 0,口径回退致负则归 0。
func diffSellerTrend(snaps []model.DiscoverSellerSnapshot) []TrendPointDTO {
	out := make([]TrendPointDTO, 0, len(snaps))
	for i, sn := range snaps {
		pt := TrendPointDTO{Dt: sn.Dt}
		if i > 0 {
			prev := snaps[i-1]
			pt.SaleCnt = nonNeg(sn.SaleCnt - prev.SaleCnt)
			pt.GmvCents = nonNeg(sn.GmvCents - prev.GmvCents)
		}
		out = append(out, pt)
	}
	return out
}

// parseCategories JSONB([]string) → []string。
func parseCategories(raw model.JSONB) []string {
	out := []string{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}

// parseEntityProducts JSONB([]EntityProductDTO) → []EntityProductDTO(店铺/视频详情子资源共用)。
func parseEntityProducts(raw model.JSONB) []EntityProductDTO {
	out := []EntityProductDTO{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}
