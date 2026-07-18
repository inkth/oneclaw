package service

import (
	"context"
	"encoding/json"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// upsertVideoList 把视频榜行落库(列表级,封面/头像 rehost 到 COS 永久化)。
// 供定时任务/榜单冷启动调用。封面/头像仅在 rehost 成功时更新,不清空既有;不碰 user_id/products 等详情字段。
// 注意:榜单行的 views/sale 等按 EchoTik 文档是「榜单周期增量」而非累计,
// 故不在此写累计快照(快照只收详情路径的累计值,混入周期增量会毁差分趋势)。
func (s *DiscoverService) upsertVideoList(ctx context.Context, region string, raw []echotik.VideoListItem) {
	if s.db == nil || len(raw) == 0 {
		return
	}
	imgs := make([]string, 0, len(raw)*2)
	for _, it := range raw {
		imgs = append(imgs, it.ReflowCover, it.Avatar)
	}
	hosted := s.rehostCovers(ctx, imgs)
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
				"sale_cnt", "sale_gmv_cents", "list_fetched_at", "updated_at",
			}
			// 带货榜(video_rank_field=2)行的播放/互动数上游不回填(恒 0):0 视为缺失,
			// 不覆盖详情/热门榜已积累的非零值(同封面「成功才更新」原则)。
			for col, v := range map[string]int{
				"views": it.TotalViewsCnt, "digg": it.TotalDiggCnt,
				"comments": it.TotalCommentsCnt, "shares": it.TotalSharesCnt,
			} {
				if v > 0 {
					cols = append(cols, col)
				}
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
	// 只写详情口径字段:views/sale_cnt 等列表列留给榜单路径(周期增量口径),两边不互踩。
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
		UserID:          d.UserID,
		IsAd:            d.IsAd.Int() == 1,
		CreatedByAI:     string(d.CreatedByAI) == "true" || string(d.CreatedByAI) == "1",
		Views7d:         d.TotalViews7dCnt.Int(),
		Views30d:        d.TotalViews30dCnt.Int(),
		Favorites:       d.TotalFavoritesCnt.Int(),
		TotalViews:      d.TotalViewsCnt.Int(),
		TotalDigg:       d.TotalDiggCnt.Int(),
		TotalComments:   d.TotalCommentsCnt.Int(),
		TotalShares:     d.TotalSharesCnt.Int(),
		TotalSaleCnt:    d.TotalVideoSaleCnt.Int(),
		TotalGmvCents:   echotik.DollarsToCents(d.TotalVideoSaleGmv.Float()),
		Products:        model.JSONB(prodsJSON),
		Raw:             model.JSONB(rawJSON),
		DetailFetchedAt: time.Now(),
	}

	target := dv
	if s.db != nil {
		s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"unique_id", "cover_url", "avatar_url", "video_desc", "duration", "create_time",
				"user_id", "is_ad", "created_by_ai", "views7d", "views30d", "favorites",
				"total_views", "total_digg", "total_comments", "total_shares", "total_sale_cnt", "total_gmv_cents",
				"products", "raw", "detail_fetched_at", "updated_at",
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
				Views: dv.TotalViews, SaleCnt: dv.TotalSaleCnt, GmvCents: dv.TotalGmvCents, // 累计口径,供差分趋势
			}
			s.db.WithContext(ctx).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_video_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"views", "sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
	}
	return videoDTOFromModel(&target), nil
}

// videoAuthority 返回视频详情口径的累计权威值(播放/点赞/评论/分享/销量/GMV)。
// 新列全 0 且 raw 里有详情整包时兜底解析(迁移前已拉过详情的旧行读时自愈,不写库)。
func videoAuthority(dv *model.DiscoverVideo) (views, digg, comments, shares, sale, gmvCents int) {
	views, digg, comments = dv.TotalViews, dv.TotalDigg, dv.TotalComments
	shares, sale, gmvCents = dv.TotalShares, dv.TotalSaleCnt, dv.TotalGmvCents
	if views > 0 || sale > 0 || len(dv.Raw) == 0 {
		return
	}
	var d echotik.VideoDetail
	if json.Unmarshal(dv.Raw, &d) != nil {
		return
	}
	views, digg, comments = d.TotalViewsCnt.Int(), d.TotalDiggCnt.Int(), d.TotalCommentsCnt.Int()
	shares, sale = d.TotalSharesCnt.Int(), d.TotalVideoSaleCnt.Int()
	gmvCents = echotik.DollarsToCents(d.TotalVideoSaleGmv.Float())
	return
}

// videoDTOFromModel 用 DB 行(含 Products JSONB)组装详情 DTO,零 API。视频详情当前不含趋势。
// 累计指标走详情权威口径;从未拉过详情的行退榜单周期值(口径偏小,SWR 会马上补详情)。
func videoDTOFromModel(dv *model.DiscoverVideo) *VideoDetailDTO {
	views, digg, comments, shares, sale, gmvCents := videoAuthority(dv)
	if views == 0 && sale == 0 {
		views, digg, comments = dv.Views, dv.Digg, dv.Comments
		shares, sale, gmvCents = dv.Shares, dv.SaleCnt, dv.SaleGmvCents
	}
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
		Views:        views,
		Views7d:      dv.Views7d,
		Views30d:     dv.Views30d,
		Digg:         digg,
		Comments:     comments,
		Shares:       shares,
		Favorites:    dv.Favorites,
		SaleCnt:      sale,
		SaleGmvCents: gmvCents,
		Products:     parseEntityProducts(dv.Products),
		VideoURL:     dv.VideoURL,
		Analysis:     dv.Analysis,
	}
}
