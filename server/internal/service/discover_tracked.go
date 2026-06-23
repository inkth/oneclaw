package service

import (
	"context"
	"time"

	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
)

// 详情级数据新鲜期按「是否被跟踪」分档(热度加权):被收藏/选品的实体刷得勤,
// 普通实体刷得稀以省 EchoTik 配额。读详情(*DetailFull)与定时主动刷(RefreshTrackedDetails)共用。
const (
	trackedDetailTTL   = 12 * time.Hour // 被收藏/选品(is_tracked)的实体
	untrackedDetailTTL = 72 * time.Hour // 普通实体
)

// trackedRefreshThrottle 定时主动刷 tracked 详情时相邻两实体间的限速(防 EchoTik 限流)。
const trackedRefreshThrottle = 2 * time.Second

// detailTTLFor 按是否被跟踪选详情新鲜期。
func detailTTLFor(tracked bool) time.Duration {
	if tracked {
		return trackedDetailTTL
	}
	return untrackedDetailTTL
}

// setEntityTracked 把主表 is_tracked 置 true,返回受影响行数(0 = 主表暂无此实体)。
func (s *DiscoverService) setEntityTracked(ctx context.Context, kind, externalID, region string) int64 {
	if s.db == nil {
		return 0
	}
	var m any
	switch kind {
	case "influencer":
		m = &model.DiscoverInfluencer{}
	case "seller":
		m = &model.DiscoverSeller{}
	case "video":
		m = &model.DiscoverVideo{}
	default:
		return 0
	}
	res := s.db.WithContext(ctx).Model(m).
		Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, externalID, region).
		Update("is_tracked", true)
	return res.RowsAffected
}

// markFavoriteEntity 收藏时把实体标为 tracked;若主表暂无此实体(如来自搜索页——搜索结果不落库),
// 后台拉一次详情落库再标记,不阻塞收藏返回。
func (s *DiscoverService) markFavoriteEntity(ctx context.Context, kind, externalID, region string) {
	if s.setEntityTracked(ctx, kind, externalID, region) > 0 {
		return
	}
	if !s.echo.Configured() {
		return
	}
	goRefresh(ctx, "track-entity:"+kind, func(bg context.Context) {
		switch kind {
		case "influencer":
			_, _ = s.refreshInfluencerDetail(bg, externalID, region)
		case "seller":
			_, _ = s.refreshSellerDetail(bg, externalID, region)
		case "video":
			_, _ = s.refreshVideoDetail(bg, externalID, region)
		}
		s.setEntityTracked(bg, kind, externalID, region)
	})
}

// RefreshTrackedDetails 刷新被跟踪且详情超过 trackedDetailTTL 的实体:每类最多 limitPerKind 个、
// 详情最旧优先、相邻刷新间限速。供定时任务调用,把 EchoTik 配额优先花在用户收藏的实体上。
func (s *DiscoverService) RefreshTrackedDetails(ctx context.Context, limitPerKind int) {
	if s.db == nil || !s.echo.Configured() || limitPerKind <= 0 {
		return
	}
	cutoff := time.Now().Add(-trackedDetailTTL)

	var infls []model.DiscoverInfluencer
	s.db.WithContext(ctx).
		Where("is_tracked = ? AND detail_fetched_at < ?", true, cutoff).
		Order("detail_fetched_at asc").Limit(limitPerKind).Find(&infls)
	for _, di := range infls {
		if sleepThrottle(ctx) {
			return
		}
		if _, err := s.refreshInfluencerDetail(ctx, di.ExternalID, di.Region); err != nil {
			logger.Warn("tracked 达人详情刷新失败", logger.String("userId", di.ExternalID), logger.Err(err))
		}
	}

	var sels []model.DiscoverSeller
	s.db.WithContext(ctx).
		Where("is_tracked = ? AND detail_fetched_at < ?", true, cutoff).
		Order("detail_fetched_at asc").Limit(limitPerKind).Find(&sels)
	for _, ds := range sels {
		if sleepThrottle(ctx) {
			return
		}
		if _, err := s.refreshSellerDetail(ctx, ds.ExternalID, ds.Region); err != nil {
			logger.Warn("tracked 店铺详情刷新失败", logger.String("sellerId", ds.ExternalID), logger.Err(err))
		}
	}

	var vids []model.DiscoverVideo
	s.db.WithContext(ctx).
		Where("is_tracked = ? AND detail_fetched_at < ?", true, cutoff).
		Order("detail_fetched_at asc").Limit(limitPerKind).Find(&vids)
	for _, dv := range vids {
		if sleepThrottle(ctx) {
			return
		}
		if _, err := s.refreshVideoDetail(ctx, dv.ExternalID, dv.Region); err != nil {
			logger.Warn("tracked 视频详情刷新失败", logger.String("videoId", dv.ExternalID), logger.Err(err))
		}
	}
}

// sleepThrottle 限速并响应取消:阻塞 trackedRefreshThrottle,ctx 取消则返回 true。
func sleepThrottle(ctx context.Context) bool {
	select {
	case <-time.After(trackedRefreshThrottle):
		return false
	case <-ctx.Done():
		return true
	}
}
