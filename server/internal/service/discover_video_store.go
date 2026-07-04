package service

import (
	"context"
	"encoding/json"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// upsertVideoList 把视频榜行落库(列表级,封面/头像 rehost 到 COS 永久化)并写当日累计快照。
// 供定时任务/榜单冷启动调用。封面/头像仅在 rehost 成功时更新,不清空既有;不碰 user_id/products 等详情字段。
func (s *DiscoverService) upsertVideoList(ctx context.Context, region string, raw []echotik.VideoListItem) {
	if s.db == nil || len(raw) == 0 {
		return
	}
	imgs := make([]string, 0, len(raw)*2)
	for _, it := range raw {
		imgs = append(imgs, it.ReflowCover, it.Avatar)
	}
	hosted := s.rehostCovers(ctx, imgs)
	today := time.Now().Format("2006-01-02")
	var transJobs []translateJob
	_ = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, it := range raw {
			if it.VideoID == "" {
				continue
			}
			dv := model.DiscoverVideo{
				Provider:      providerEchoTik,
				ExternalID:    it.VideoID,
				Region:        region,
				NickName:      it.NickName,
				UniqueID:      it.UniqueID,
				Desc:          it.VideoDesc,
				Category:      it.Category,
				Duration:      it.Duration,
				CreateTime:    string(it.CreateTime),
				Views:         it.TotalViewsCnt,
				Digg:          it.TotalDiggCnt,
				Comments:      it.TotalCommentsCnt,
				Shares:        it.TotalSharesCnt,
				SaleCnt:       it.TotalVideoSaleCnt,
				SaleGmvCents:  echotik.DollarsToCents(it.TotalVideoSaleGmvAmt),
				ListFetchedAt: time.Now(),
			}
			cols := []string{
				"nick_name", "unique_id", "video_desc", "category", "duration", "create_time",
				"views", "digg", "comments", "shares", "sale_cnt", "sale_gmv_cents",
				"list_fetched_at", "updated_at",
			}
			if cos := hosted[it.ReflowCover]; cos != "" {
				dv.CoverURL = cos
				cols = append(cols, "cover_url")
			}
			if cos := hosted[it.Avatar]; cos != "" {
				dv.AvatarURL = cos
				cols = append(cols, "avatar_url")
			}
			tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
				DoUpdates: clause.AssignmentColumns(cols),
			}).Create(&dv)

			var stored model.DiscoverVideo
			if err := tx.Where("provider = ? AND external_id = ? AND region = ?",
				providerEchoTik, it.VideoID, region).First(&stored).Error; err != nil {
				continue
			}
			if stored.DescZh == "" && stored.Desc != "" {
				transJobs = append(transJobs, translateJob{Table: "discover_videos", Column: "desc_zh", ID: stored.ID, Text: stored.Desc})
			}
			snap := model.DiscoverVideoSnapshot{
				DiscoverVideoID: stored.ID, Dt: today,
				Views: it.TotalViewsCnt, SaleCnt: it.TotalVideoSaleCnt, GmvCents: echotik.DollarsToCents(it.TotalVideoSaleGmvAmt),
			}
			tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_video_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"views", "sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
		return nil
	})
	s.enqueueTranslate(transJobs)
}

// refreshVideoDetail 拉视频详情 + 带货商品,封面/头像永久化到 COS,upsert 主表(详情级全字段)并写当日快照。
func (s *DiscoverService) refreshVideoDetail(ctx context.Context, videoID, region string) (*VideoDetailDTO, error) {
	d, err := s.echo.GetVideoDetail(ctx, videoID, region)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}

	pids := parseIDList(d.VideoProducts)
	var prodsRaw []echotik.ProductDetail
	if len(pids) > 0 {
		prodsRaw, _ = s.echo.GetProductDetails(ctx, pids, region)
	}

	toHost := make([]string, 0, len(prodsRaw)+2)
	toHost = append(toHost, d.ReflowCover, d.Avatar)
	prodRaw := make([]string, len(prodsRaw))
	for i, pr := range prodsRaw {
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

	prods := make([]EntityProductDTO, 0, len(prodsRaw))
	for i, pr := range prodsRaw {
		prods = append(prods, EntityProductDTO{
			ProductID:      pr.ProductID,
			Name:           pr.ProductName,
			Cover:          host(prodRaw[i]),
			AvgPriceCents:  echotik.DollarsToCents(pr.SpuAvgPrice.Float()),
			CommissionRate: pr.ProductCommissionRate.Float(),
			Rating:         pr.ProductRating.Float(),
		})
	}

	prodsJSON, _ := json.Marshal(prods)
	rawJSON, _ := json.Marshal(d)
	dv := model.DiscoverVideo{
		Provider:        providerEchoTik,
		ExternalID:      d.VideoID,
		Region:          region,
		UniqueID:        d.UniqueID,
		CoverURL:        host(d.ReflowCover),
		AvatarURL:       host(d.Avatar),
		Desc:            d.VideoDesc,
		Duration:        d.Duration.Int(),
		CreateTime:      string(d.CreateTime),
		Views:           d.TotalViewsCnt.Int(),
		Digg:            d.TotalDiggCnt.Int(),
		Comments:        d.TotalCommentsCnt.Int(),
		Shares:          d.TotalSharesCnt.Int(),
		SaleCnt:         d.TotalVideoSaleCnt.Int(),
		SaleGmvCents:    echotik.DollarsToCents(d.TotalVideoSaleGmv.Float()),
		UserID:          d.UserID,
		IsAd:            d.IsAd.Int() == 1,
		CreatedByAI:     string(d.CreatedByAI) == "true" || string(d.CreatedByAI) == "1",
		Views7d:         d.TotalViews7dCnt.Int(),
		Views30d:        d.TotalViews30dCnt.Int(),
		Favorites:       d.TotalFavoritesCnt.Int(),
		Products:        model.JSONB(prodsJSON),
		Raw:             model.JSONB(rawJSON),
		ListFetchedAt:   time.Now(),
		DetailFetchedAt: time.Now(),
	}

	target := dv
	if s.db != nil {
		s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"unique_id", "cover_url", "avatar_url", "video_desc", "duration", "create_time",
				"views", "digg", "comments", "shares", "sale_cnt", "sale_gmv_cents",
				"user_id", "is_ad", "created_by_ai", "views7d", "views30d", "favorites",
				"products", "raw", "list_fetched_at", "detail_fetched_at", "updated_at",
			}),
		}).Create(&dv)

		var stored model.DiscoverVideo
		if e := s.db.WithContext(ctx).Where("provider = ? AND external_id = ? AND region = ?",
			providerEchoTik, d.VideoID, region).First(&stored).Error; e == nil {
			target = stored
			if stored.DescZh == "" && stored.Desc != "" {
				s.enqueueTranslate([]translateJob{{Table: "discover_videos", Column: "desc_zh", ID: stored.ID, Text: stored.Desc}})
			}
			today := time.Now().Format("2006-01-02")
			snap := model.DiscoverVideoSnapshot{
				DiscoverVideoID: stored.ID, Dt: today,
				Views: dv.Views, SaleCnt: dv.SaleCnt, GmvCents: dv.SaleGmvCents,
			}
			s.db.WithContext(ctx).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_video_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"views", "sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
	}
	return videoDTOFromModel(&target), nil
}

// videoDTOFromModel 用 DB 行(含 Products JSONB)组装详情 DTO,零 API。视频详情当前不含趋势。
func videoDTOFromModel(dv *model.DiscoverVideo) *VideoDetailDTO {
	return &VideoDetailDTO{
		VideoID:      dv.ExternalID,
		UserID:       dv.UserID,
		UniqueID:     dv.UniqueID,
		Region:       dv.Region,
		Desc:         dv.Desc,
		DescZh:       dv.DescZh,
		Cover:        dv.CoverURL,
		Avatar:       dv.AvatarURL,
		Duration:     dv.Duration,
		CreateTime:   dv.CreateTime,
		IsAd:         dv.IsAd,
		CreatedByAI:  dv.CreatedByAI,
		Views:        dv.Views,
		Views7d:      dv.Views7d,
		Views30d:     dv.Views30d,
		Digg:         dv.Digg,
		Comments:     dv.Comments,
		Shares:       dv.Shares,
		Favorites:    dv.Favorites,
		SaleCnt:      dv.SaleCnt,
		SaleGmvCents: dv.SaleGmvCents,
		Products:     parseEntityProducts(dv.Products),
	}
}
