package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// upsertSellerList 把店铺榜行落库(列表级,封面 rehost 到 COS 永久化)。
// 供定时任务/榜单冷启动调用。封面仅在 rehost 成功时更新,不清空既有;不碰 seller_link/products
// 等详情独有字段与 detail_fetched_at。categories 用榜单的 most_product_category_list(n=5,与详情同源)。
// 注意:榜单行的 sale_cnt 等按 EchoTik 文档是「当前榜单周期的增量」而非累计,
// 故不在此写累计快照(快照只收详情路径的累计值,混入周期增量会毁掉差分趋势)。
func (s *DiscoverService) upsertSellerList(ctx context.Context, region string, raw []echotik.SellerListItem) {
	if s.db == nil || len(raw) == 0 {
		return
	}
	covers := make([]string, 0, len(raw))
	for _, it := range raw {
		covers = append(covers, it.CoverURL)
	}
	hosted := s.rehostCovers(ctx, covers)
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
		}
		return nil
	})
}

// sellerDetailBackfillPerRun 单次榜单落库后回填详情的店铺数上限:冷启动路径跑在
// goRefresh 的 90s 预算里,串行 2 次 API/店铺,20 个刚好一个前端页;没排上的下轮续。
const sellerDetailBackfillPerRun = 20

// backfillSellerDetails 给榜单店铺补详情级数据——近 7 天销量/GMV、累计权威值、在售商品数,
// 榜单行都没有这些。只刷详情缺失或超过 entitySlowTTL(24h,与店铺榜预热节奏对齐)的店铺,
// 串行防打爆 EchoTik,ctx 到期即止。
func (s *DiscoverService) backfillSellerDetails(ctx context.Context, region string, ids []string) {
	if s.db == nil || !s.echo.Configured() || len(ids) == 0 {
		return
	}
	var fresh []model.DiscoverSeller
	s.db.WithContext(ctx).Select("external_id").
		Where("provider = ? AND region = ? AND external_id IN ? AND detail_fetched_at > ?",
			providerEchoTik, region, ids, time.Now().Add(-entitySlowTTL)).
		Find(&fresh)
	freshSet := make(map[string]struct{}, len(fresh))
	for _, r := range fresh {
		freshSet[r.ExternalID] = struct{}{}
	}
	done := 0
	for _, id := range ids {
		if ctx.Err() != nil || done >= sellerDetailBackfillPerRun {
			break
		}
		if _, ok := freshSet[id]; ok {
			continue
		}
		if _, err := s.refreshSellerDetail(ctx, id, region); err != nil {
			logger.Warn("店铺详情回填失败", logger.String("sellerId", id), logger.Err(err))
			continue
		}
		done++
	}
	if done > 0 {
		logger.Info("店铺详情回填", logger.String("region", region), logger.Int("count", done))
	}
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
	// 商品列表拉失败不能连坐详情:详情本身已到手,照常落库,但 products 列保留既有值
	// (空列表覆盖会让「店铺热销商品」卡整块消失,且 detail_fetched_at 一刷就冻 72h)。
	products, prodErr := s.echo.GetSellerProducts(ctx, sellerID, region, 10)
	if prodErr != nil {
		logger.Warn("店铺商品列表拉取失败,保留既有列表",
			logger.String("sellerId", sellerID), logger.Err(prodErr))
	}

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
	// 只写详情口径字段:sale_cnt 等列表列留给榜单路径(周期增量口径),两边不互踩。
	ds := model.DiscoverSeller{
		Provider:        providerEchoTik,
		ExternalID:      d.SellerID,
		Region:          region,
		SellerName:      d.SellerName,
		CoverURL:        host(d.CoverURL),
		Rating:          d.Rating.Float(),
		Categories:      model.JSONB(catsJSON),
		SellerLink:      d.SellerLink,
		AvgPriceCents:   echotik.DollarsToCents(d.SpuAvgPrice.Float()),
		Sale7dCnt:       d.TotalSale7dCnt.Int(),
		Sale30dCnt:      d.TotalSale30dCnt.Int(),
		Gmv7dCents:      echotik.DollarsToCents(d.TotalSaleGmv7dAmt.Float()),
		Gmv30dCents:     echotik.DollarsToCents(d.TotalSaleGmv30dAmt.Float()),
		TotalSaleCnt:    d.TotalSaleCnt.Int(),
		TotalGmvCents:   echotik.DollarsToCents(d.TotalSaleGmvAmt.Float()),
		TotalIflCnt:     d.TotalIflCnt.Int(),
		TotalVideoCnt:   d.TotalVideoCnt.Int(),
		TotalLiveCnt:    d.TotalLiveCnt.Int(),
		CrawlProductCnt: sellerProductCnt(d),
		Products:        model.JSONB(prodsJSON),
		Raw:             model.JSONB(rawJSON),
		DetailFetchedAt: time.Now(),
	}

	target := ds
	if s.db != nil {
		cols := []string{
			"seller_name", "cover_url", "rating", "categories", "seller_link", "avg_price_cents",
			"sale7d_cnt", "sale30d_cnt", "gmv7d_cents", "gmv30d_cents",
			"total_sale_cnt", "total_gmv_cents", "total_ifl_cnt", "total_video_cnt", "total_live_cnt",
			"crawl_product_cnt", "raw", "detail_fetched_at", "updated_at",
		}
		if prodErr == nil { // 拉成功才写:真·空列表(店铺没在售品)照常覆盖,失败则不动既有值
			cols = append(cols, "products")
		}
		s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
			DoUpdates: clause.AssignmentColumns(cols),
		}).Create(&ds)

		var stored model.DiscoverSeller
		if e := s.db.WithContext(ctx).Where("provider = ? AND external_id = ? AND region = ?",
			providerEchoTik, d.SellerID, region).First(&stored).Error; e == nil {
			target = stored
			today := time.Now().Format("2006-01-02")
			snap := model.DiscoverSellerSnapshot{
				DiscoverSellerID: stored.ID, Dt: today,
				SaleCnt: ds.TotalSaleCnt, GmvCents: ds.TotalGmvCents, // 累计口径,供差分趋势/spark
			}
			s.db.WithContext(ctx).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_seller_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
	}
	return s.sellerDTOFromModel(ctx, &target), nil
}

// sellerProductCnt 在售商品数:优先 total_crawl_product_cnt(在售口径)。上游约一成店铺
// 不返回该字段(如 medicube US Store),回落 total_product_cnt(历史在店,含已下架,口径偏大)
// ——有数强于显示 0。两个都没有才是真 0。
func sellerProductCnt(d *echotik.SellerDetail) int {
	if n := d.TotalCrawlProductCnt.Int(); n > 0 {
		return n
	}
	return d.TotalProductCnt.Int()
}

// sellerAuthority 返回详情口径的累计权威值(总销量/总GMV/达人/视频/直播/在售商品数)。
// 对应列为 0 且 raw 里有详情整包时兜底解析——迁移前已拉过详情、以及在售商品数因上游缺字段
// 落成 0 的旧行,读时自愈,不写库。累计值与在售商品数各自独立判缺,互不牵连。
func sellerAuthority(ds *model.DiscoverSeller) (sale, gmvCents, ifl, video, live, crawl int) {
	sale, gmvCents, ifl = ds.TotalSaleCnt, ds.TotalGmvCents, ds.TotalIflCnt
	video, live, crawl = ds.TotalVideoCnt, ds.TotalLiveCnt, ds.CrawlProductCnt
	needTotals, needCrawl := sale == 0 && gmvCents == 0, crawl == 0
	if (!needTotals && !needCrawl) || len(ds.Raw) == 0 {
		return
	}
	var d echotik.SellerDetail
	if json.Unmarshal(ds.Raw, &d) != nil {
		return
	}
	if needTotals {
		sale, gmvCents = d.TotalSaleCnt.Int(), echotik.DollarsToCents(d.TotalSaleGmvAmt.Float())
		ifl, video, live = d.TotalIflCnt.Int(), d.TotalVideoCnt.Int(), d.TotalLiveCnt.Int()
	}
	if needCrawl {
		crawl = sellerProductCnt(&d)
	}
	return
}

// sellerDTOFromModel 用 DB 行(含 Products JSONB)+ 本地快照差分趋势组装详情 DTO,零 API。
func (s *DiscoverService) sellerDTOFromModel(ctx context.Context, ds *model.DiscoverSeller) *SellerDetailDTO {
	sale, gmvCents, ifl, video, live, crawl := sellerAuthority(ds)
	if sale == 0 && gmvCents == 0 {
		// 从未拉过详情的行:退榜单周期值(口径偏小,但比空屏好;SWR 会马上补详情)。
		sale, gmvCents, ifl, video, live = ds.SaleCnt, ds.SaleGmvCents, ds.IflCnt, ds.VideoCnt, ds.LiveCnt
	}
	productCnt := crawl
	if productCnt == 0 {
		productCnt = ds.ProductCnt
	}
	return &SellerDetailDTO{
		SellerID:          ds.ExternalID,
		SellerName:        ds.SellerName,
		Region:            ds.Region,
		Cover:             ds.CoverURL,
		SellerLink:        ds.SellerLink,
		Rating:            ds.Rating,
		Categories:        parseCategories(ds.Categories),
		AvgPriceCents:     ds.AvgPriceCents,
		TotalProductCnt:   productCnt,
		TotalSaleCnt:      sale,
		TotalSaleGmvCents: gmvCents,
		TotalIflCnt:       ifl,
		TotalVideoCnt:     video,
		TotalLiveCnt:      live,
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

// loadSellerSparks 批量取每店铺最近 8 天累计快照并差分成日销量增量序列(oldest→newest,
// 最多 7 点),供榜单迷你趋势线。与详情页 sellerTrendFromSnapshots 同源同口径,只是限窗+批量。
func (s *DiscoverService) loadSellerSparks(ctx context.Context, ids []uuid.UUID) map[uuid.UUID][]int {
	out := map[uuid.UUID][]int{}
	if s.db == nil || len(ids) == 0 {
		return out
	}
	cutoff := time.Now().AddDate(0, 0, -8).Format("2006-01-02")
	var snaps []model.DiscoverSellerSnapshot
	if err := s.db.WithContext(ctx).
		Where("discover_seller_id IN ? AND dt >= ?", ids, cutoff).
		Order("dt asc").Find(&snaps).Error; err != nil {
		return out
	}
	grouped := map[uuid.UUID][]model.DiscoverSellerSnapshot{}
	for _, sn := range snaps {
		grouped[sn.DiscoverSellerID] = append(grouped[sn.DiscoverSellerID], sn)
	}
	for id, g := range grouped {
		if len(g) < 2 {
			continue // 单点差分不出增量,前端按无数据处理
		}
		pts := make([]int, 0, len(g)-1)
		for i := 1; i < len(g); i++ {
			pts = append(pts, nonNeg(g[i].SaleCnt-g[i-1].SaleCnt))
		}
		out[id] = pts
	}
	return out
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
