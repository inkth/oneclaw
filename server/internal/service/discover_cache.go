package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm/clause"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// 店铺/达人/视频榜 + 类目下拉的通用缓存 TTL。这些数据无工作台个性化,可全局复用。
const entityCacheTTL = 6 * time.Hour

// entityCacheKey 把榜单查询参数拼成缓存键(含类目/分页,避免串榜)。
func entityCacheKey(kind string, p echotik.RanklistParams) string {
	return fmt.Sprintf("%s:%s:%d:%d:%s:%d:%d", kind, p.Region, p.RankType, p.RankField, p.CategoryID, p.PageSize, p.PageNum)
}

// cacheGetJSON 命中且未过期则反序列化进 out,返回缓存时间。db 为空(测试/devmock)时直接 miss。
func (s *DiscoverService) cacheGetJSON(ctx context.Context, key string, ttl time.Duration, out any) (time.Time, bool) {
	if s.db == nil {
		return time.Time{}, false
	}
	var c model.DiscoverCache
	if err := s.db.WithContext(ctx).Where("cache_key = ?", key).First(&c).Error; err != nil {
		return time.Time{}, false
	}
	if time.Since(c.FetchedAt) > ttl || len(c.Payload) == 0 {
		return time.Time{}, false
	}
	if err := json.Unmarshal(c.Payload, out); err != nil {
		return time.Time{}, false
	}
	return c.FetchedAt, true
}

// cacheSetJSON 按 cache_key upsert 缓存。db 为空时静默跳过。
func (s *DiscoverService) cacheSetJSON(ctx context.Context, key string, payload any) {
	if s.db == nil {
		return
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	rec := model.DiscoverCache{CacheKey: key, Payload: model.JSONB(b), FetchedAt: time.Now()}
	s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "cache_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"payload", "fetched_at"}),
	}).Create(&rec)
}

// cachedEntity 三榜统一的「mock / 缓存命中 / live + 回写」流程。
// configured=false → mock(不缓存);命中缓存直接返回;未命中走 live(),成功回写,失败降级 mock。
func cachedEntity[T any](
	s *DiscoverService,
	ctx context.Context,
	key string,
	configured bool,
	mock func() []T,
	live func() ([]T, error),
) *EntityRanklistResult[T] {
	res := &EntityRanklistResult[T]{Rows: []T{}}
	if !configured {
		res.State = "mock"
		res.Rows = mock()
		return res
	}
	var rows []T
	if at, ok := s.cacheGetJSON(ctx, key, entityCacheTTL, &rows); ok {
		res.State = "cached"
		res.FetchedAt = &at
		res.Rows = rows
		return res
	}
	rows, err := live()
	if err != nil {
		res.State = "error"
		res.Rows = mock()
		return res
	}
	if len(rows) == 0 {
		res.State = "empty"
		return res
	}
	s.cacheSetJSON(ctx, key, rows)
	now := time.Now()
	res.State = "live"
	res.FetchedAt = &now
	res.Rows = rows
	return res
}

// entitySearch 三榜关键词搜索的统一流程(不缓存:搜索结果多变)。
// configured=false → mock;live() 失败 → error + mock;空结果 → empty。
func entitySearch[T any](
	configured bool,
	mock func() []T,
	live func() ([]T, error),
) *EntityRanklistResult[T] {
	res := &EntityRanklistResult[T]{Rows: []T{}}
	if !configured {
		res.State = "mock"
		res.Rows = mock()
		return res
	}
	rows, err := live()
	if err != nil {
		res.State = "error"
		res.Rows = mock()
		return res
	}
	if len(rows) == 0 {
		res.State = "empty"
		return res
	}
	now := time.Now()
	res.State = "live"
	res.FetchedAt = &now
	res.Rows = rows
	return res
}
