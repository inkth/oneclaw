package service

import (
	"context"
	"encoding/json"
	"time"

	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/model"
)

// 店铺/达人/视频榜 + 类目下拉的通用缓存 TTL。这些数据无工作台个性化,可全局复用。
const entityCacheTTL = 6 * time.Hour

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
