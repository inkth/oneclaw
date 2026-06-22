package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// upsertInfluencerList 把达人榜行落库(列表级)并写当日累计快照。供定时任务调用。
// 列表 upsert 只更新榜单字段与 list_fetched_at,绝不碰详情字段(avatar/gender/signature/videos)
// 与 detail_fetched_at,避免把详情刷新写入的值清空。
func (s *DiscoverService) upsertInfluencerList(ctx context.Context, region string, rows []InfluencerDTO) {
	if s.db == nil || len(rows) == 0 {
		return
	}
	today := time.Now().Format("2006-01-02")
	_ = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, r := range rows {
			if r.UserID == "" {
				continue
			}
			di := model.DiscoverInfluencer{
				Provider:      providerEchoTik,
				ExternalID:    r.UserID,
				Region:        region,
				UniqueID:      r.UniqueID,
				NickName:      r.NickName,
				Category:      r.Category,
				EcScore:       r.EcScore,
				Followers:     r.TotalFollowersCnt,
				DiggCnt:       r.TotalDiggCnt,
				ProductCnt:    r.TotalProductCnt,
				PostVideoCnt:  r.TotalPostVideoCnt,
				LiveCnt:       r.TotalLiveCnt,
				SaleCnt:       r.TotalSaleCnt,
				SaleGmvCents:  echotik.DollarsToCents(r.TotalSaleGmvAmt),
				ListFetchedAt: time.Now(),
			}
			tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"unique_id", "nick_name", "category", "ec_score",
					"followers", "digg_cnt", "product_cnt", "post_video_cnt", "live_cnt",
					"sale_cnt", "sale_gmv_cents", "list_fetched_at", "updated_at",
				}),
			}).Create(&di)

			var stored model.DiscoverInfluencer
			if err := tx.Where("provider = ? AND external_id = ? AND region = ?",
				providerEchoTik, r.UserID, region).First(&stored).Error; err != nil {
				continue
			}
			snap := model.DiscoverInfluencerSnapshot{
				DiscoverInfluencerID: stored.ID, Dt: today,
				Followers: r.TotalFollowersCnt, SaleCnt: r.TotalSaleCnt, GmvCents: echotik.DollarsToCents(r.TotalSaleGmvAmt),
			}
			tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_influencer_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"followers", "sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
		return nil
	})
}

// refreshInfluencerDetail 拉 EchoTik 达人详情 + 带货视频,封面永久化到 COS,upsert 主表(详情级全字段)
// 并写当日累计快照,返回组装好的 DTO。趋势不在此取(改由本地快照差分,见 influencerTrendFromSnapshots)。
func (s *DiscoverService) refreshInfluencerDetail(ctx context.Context, userID, region string) (*InfluencerDetailDTO, error) {
	d, err := s.echo.GetInfluencerDetail(ctx, userID, region)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}
	videos, _ := s.echo.GetInfluencerVideos(ctx, userID, region, 10)

	// 头像 + 视频封面永久化到 COS(详情读 DB 后不再每次签名,避免 3 天过期裂图)。
	toHost := make([]string, 0, len(videos)+1)
	toHost = append(toHost, d.Avatar)
	vidRaw := make([]string, len(videos))
	for i, v := range videos {
		vidRaw[i] = v.ReflowCover
		toHost = append(toHost, v.ReflowCover)
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

	vids := make([]InfluencerVideoDTO, 0, len(videos))
	for i, v := range videos {
		vids = append(vids, InfluencerVideoDTO{
			VideoID:      v.VideoID,
			UniqueID:     v.UniqueID,
			Cover:        host(vidRaw[i]),
			Desc:         v.VideoDesc,
			IsAd:         v.IsAd.Int() == 1,
			Views:        v.TotalViewsCnt.Int(),
			Digg:         v.TotalDiggCnt.Int(),
			Comments:     v.TotalCommentsCnt.Int(),
			Shares:       v.TotalSharesCnt.Int(),
			CreateTime:   string(v.CreateTime),
			SaleCnt:      v.TotalVideoSaleCnt.Int(),
			SaleGmvCents: echotik.DollarsToCents(v.TotalVideoSaleGmv.Float()),
		})
	}

	videosJSON, _ := json.Marshal(vids)
	rawJSON, _ := json.Marshal(d)
	di := model.DiscoverInfluencer{
		Provider:        providerEchoTik,
		ExternalID:      d.UserID,
		Region:          region,
		UniqueID:        d.UniqueID,
		NickName:        d.NickName,
		Category:        d.Category,
		EcScore:         d.EcScore.Float(),
		Followers:       d.TotalFollowersCnt.Int(),
		DiggCnt:         d.TotalDiggCnt.Int(),
		ProductCnt:      d.TotalProductCnt.Int(),
		PostVideoCnt:    d.TotalPostVideoCnt.Int(),
		LiveCnt:         d.TotalLiveCnt.Int(),
		SaleCnt:         d.TotalSaleCnt.Int(),
		SaleGmvCents:    echotik.DollarsToCents(d.TotalSaleGmvAmt.Float()),
		AvatarURL:       host(d.Avatar),
		Gender:          d.Gender,
		Language:        d.Language,
		ContactEmail:    d.ContactEmail,
		Signature:       d.Signature,
		InteractionRate: d.InteractionRate.Float(),
		Followers30d:    d.TotalFollowers30dCnt.Int(),
		ViewsCnt:        d.TotalViewsCnt.Int(),
		Videos:          model.JSONB(videosJSON),
		Raw:             model.JSONB(rawJSON),
		ListFetchedAt:   time.Now(),
		DetailFetchedAt: time.Now(),
	}

	target := di
	if s.db != nil {
		s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "provider"}, {Name: "external_id"}, {Name: "region"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"unique_id", "nick_name", "category", "ec_score",
				"followers", "digg_cnt", "product_cnt", "post_video_cnt", "live_cnt", "sale_cnt", "sale_gmv_cents",
				"avatar_url", "gender", "language", "contact_email", "signature", "interaction_rate", "followers30d", "views_cnt",
				"videos", "raw", "list_fetched_at", "detail_fetched_at", "updated_at",
			}),
		}).Create(&di)

		var stored model.DiscoverInfluencer
		if e := s.db.WithContext(ctx).Where("provider = ? AND external_id = ? AND region = ?",
			providerEchoTik, d.UserID, region).First(&stored).Error; e == nil {
			target = stored
			today := time.Now().Format("2006-01-02")
			snap := model.DiscoverInfluencerSnapshot{
				DiscoverInfluencerID: stored.ID, Dt: today,
				Followers: di.Followers, SaleCnt: di.SaleCnt, GmvCents: di.SaleGmvCents,
			}
			s.db.WithContext(ctx).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "discover_influencer_id"}, {Name: "dt"}},
				DoUpdates: clause.AssignmentColumns([]string{"followers", "sale_cnt", "gmv_cents"}),
			}).Create(&snap)
		}
	}
	return s.influencerDTOFromModel(ctx, &target), nil
}

// influencerDTOFromModel 用 DB 行(含 Videos JSONB)+ 本地快照差分趋势组装详情 DTO,零 API。
func (s *DiscoverService) influencerDTOFromModel(ctx context.Context, di *model.DiscoverInfluencer) *InfluencerDetailDTO {
	return &InfluencerDetailDTO{
		UserID:            di.ExternalID,
		UniqueID:          di.UniqueID,
		NickName:          di.NickName,
		Region:            di.Region,
		Avatar:            di.AvatarURL,
		Category:          di.Category,
		Gender:            di.Gender,
		Language:          di.Language,
		ContactEmail:      di.ContactEmail,
		Signature:         di.Signature,
		EcScore:           di.EcScore,
		InteractionRate:   di.InteractionRate,
		Followers:         di.Followers,
		Followers30d:      di.Followers30d,
		PostVideoCnt:      di.PostVideoCnt,
		ProductCnt:        di.ProductCnt,
		TotalSaleCnt:      di.SaleCnt,
		TotalSaleGmvCents: di.SaleGmvCents,
		TotalViewsCnt:     di.ViewsCnt,
		TotalDiggCnt:      di.DiggCnt,
		Videos:            parseInfluencerVideos(di.Videos),
		Trend:             s.influencerTrendFromSnapshots(ctx, di.ID),
	}
}

// influencerTrendFromSnapshots 读累计快照,差分出趋势点(followers 用累计,sale/gmv/newFollowers 用日增量)。
// 趋势长度 = 已攒快照天数,会逐日变长(冷启动期可能很短,这是自建数据资产的正常过程)。
func (s *DiscoverService) influencerTrendFromSnapshots(ctx context.Context, id uuid.UUID) []InfluencerTrendDTO {
	if s.db == nil || id == uuid.Nil {
		return []InfluencerTrendDTO{}
	}
	var snaps []model.DiscoverInfluencerSnapshot
	if err := s.db.WithContext(ctx).
		Where("discover_influencer_id = ?", id).
		Order("dt asc").Find(&snaps).Error; err != nil {
		return []InfluencerTrendDTO{}
	}
	return diffInfluencerTrend(snaps)
}

// diffInfluencerTrend 把按 dt 升序的累计快照差分成趋势点(纯函数,便于测试)。
// Followers 用累计值;NewFollowers/SaleCnt/GmvCents 为相邻两天日增量,首点无前值留 0,
// 口径回退致负则归 0。
func diffInfluencerTrend(snaps []model.DiscoverInfluencerSnapshot) []InfluencerTrendDTO {
	out := make([]InfluencerTrendDTO, 0, len(snaps))
	for i, sn := range snaps {
		pt := InfluencerTrendDTO{Dt: sn.Dt, Followers: sn.Followers}
		if i > 0 {
			prev := snaps[i-1]
			pt.NewFollowers = nonNeg(sn.Followers - prev.Followers)
			pt.SaleCnt = nonNeg(sn.SaleCnt - prev.SaleCnt)
			pt.GmvCents = nonNeg(sn.GmvCents - prev.GmvCents)
		}
		out = append(out, pt)
	}
	return out
}

func nonNeg(v int) int {
	if v < 0 {
		return 0
	}
	return v
}

func parseInfluencerVideos(raw model.JSONB) []InfluencerVideoDTO {
	out := []InfluencerVideoDTO{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}
