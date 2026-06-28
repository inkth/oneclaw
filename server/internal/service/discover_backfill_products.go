package service

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"gorm.io/gorm/clause"

	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// backfillRegions 与前端 app/(app)/app/discover/_components/regions.ts 对齐的 TikTok Shop 全部开放站点。
// 可用 BACKFILL_PRODUCTS_REGIONS=US,GB,... 覆盖(逗号分隔)。
var backfillRegions = []string{
	"US", "GB", "ID", "TH", "VN", "MY", "PH", "SG",
	"ES", "MX", "DE", "FR", "IT", "BR", "JP", "IE",
}

const (
	backfillPagesPerCombo = 5  // 每个(地区×类目)拉前 5 页
	backfillPageSize      = 10 // EchoTik 单页上限 10,一页恰好一次 API 请求
)

// backfillReqInterval 每次 EchoTik 请求后限速 1s(防限流);测试里调小以免干等。
var backfillReqInterval = 1 * time.Second

// BackfillAllProducts 遍历所有站点 × 所有一级类目,把每个组合的前 5 页商品落库(upsert)。
// 每次 EchoTik 请求间隔 1 秒;以 DiscoverBackfillCursor 记录进度,已完成的组合/已拉的页直接跳过,
// 因此可安全中断后重跑(已有数据不再请求)。封面不在此补取,交给 --backfill-covers。
func (s *DiscoverService) BackfillAllProducts(ctx context.Context) (fetched, skipped int, err error) {
	if !s.echo.Configured() {
		return 0, 0, errors.New("echotik 未配置")
	}

	regions := backfillRegions
	if env := strings.TrimSpace(os.Getenv("BACKFILL_PRODUCTS_REGIONS")); env != "" {
		regions = nil
		for _, r := range strings.Split(env, ",") {
			if r = strings.ToUpper(strings.TrimSpace(r)); r != "" {
				regions = append(regions, r)
			}
		}
	}

	for _, region := range regions {
		if ctx.Err() != nil {
			return fetched, skipped, ctx.Err()
		}

		// 拉该站点一级类目(也是一次 API,同样限速)。失败/空回退占位类目(已知全局 L1 集)。
		cats, cerr := s.echo.GetCategoriesL1(ctx, region)
		s.backfillSleep(ctx, backfillReqInterval)
		if cerr != nil || len(cats) == 0 {
			logger.Warn("[backfill-products] 类目拉取失败,回退占位类目",
				logger.String("region", region), logger.Err(cerr))
			cats = echotik.MockCategoriesL1()
		}

		for _, cat := range cats {
			if ctx.Err() != nil {
				return fetched, skipped, ctx.Err()
			}
			cur := s.loadBackfillCursor(ctx, region, cat.CategoryID)
			if cur.Completed {
				skipped++
				continue
			}

			for page := cur.DonePages + 1; page <= backfillPagesPerCombo; page++ {
				if ctx.Err() != nil {
					return fetched, skipped, ctx.Err()
				}
				n, rerr := s.RefreshRanklist(ctx, echotik.RanklistParams{
					Region:     region,
					RankType:   echotik.RankHot,
					RankField:  echotik.FieldSales,
					CategoryID: cat.CategoryID,
					PageNum:    page,
					PageSize:   backfillPageSize,
				})
				s.backfillSleep(ctx, backfillReqInterval)
				if rerr != nil {
					// 本组合本轮中断;cursor 不前进,下次重跑从该页续上。
					logger.Warn("[backfill-products] 拉取失败,跳到下一组合",
						logger.String("region", region),
						logger.String("category", cat.CategoryID),
						logger.Int("page", page), logger.Err(rerr))
					break
				}
				fetched += n
				cur.DonePages = page
				if n < backfillPageSize {
					cur.Completed = true // 不足一页 => 没有更多
				}
				s.saveBackfillCursor(ctx, &cur)
				if cur.Completed {
					break
				}
			}
			if cur.DonePages >= backfillPagesPerCombo && !cur.Completed {
				cur.Completed = true
				s.saveBackfillCursor(ctx, &cur)
			}
			logger.Info("[backfill-products] 组合完成",
				logger.String("region", region),
				logger.String("category", cat.CategoryID),
				logger.Int("donePages", cur.DonePages))
		}
	}
	return fetched, skipped, nil
}

// backfillSleep 限速;ctx 取消即提前返回。
func (s *DiscoverService) backfillSleep(ctx context.Context, d time.Duration) {
	select {
	case <-time.After(d):
	case <-ctx.Done():
	}
}

func (s *DiscoverService) loadBackfillCursor(ctx context.Context, region, categoryID string) model.DiscoverBackfillCursor {
	var c model.DiscoverBackfillCursor
	s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND category_id = ?", providerEchoTik, region, categoryID).
		First(&c)
	// 不存在时为零值;补齐键字段供后续 upsert。
	c.Provider, c.Region, c.CategoryID = providerEchoTik, region, categoryID
	return c
}

func (s *DiscoverService) saveBackfillCursor(ctx context.Context, c *model.DiscoverBackfillCursor) {
	c.UpdatedAt = time.Now()
	s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "provider"}, {Name: "region"}, {Name: "category_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"done_pages", "completed", "updated_at"}),
	}).Create(c)
}
