package service

import (
	"context"
	"errors"
	"os"
	"strings"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/service/echotik"
)

const (
	entityBackfillPagesPerCombo = 3  // 每(地区×类目×类型)拉前 3 页
	entityBackfillPageSize      = 20 // 与前端 entity 页 page_size 对齐(顺序表键含 page_size)
)

var entityBackfillKinds = []string{"seller", "influencer", "video"}

// BackfillAllEntities 遍历所有站点 × 所有一级类目(含无类目主榜)× 三类实体,把每组合前 N 页落库
// (upsert 主表 + 顺序表)。每次 EchoTik 请求限速 1s;以 DiscoverBackfillCursor 记录进度
// (category_id 键加 "ent:<kind>:" 前缀,与商品回填游标隔离),已完成组合跳过,可安全中断后重跑。
// 供 --backfill-entities 首铺实体数据用,使实体三榜任意类目/翻页开箱即本地可读。
func (s *DiscoverService) BackfillAllEntities(ctx context.Context) (fetched, skipped int, err error) {
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
		cats, cerr := s.echo.GetCategoriesL1(ctx, region)
		s.backfillSleep(ctx, backfillReqInterval)
		if cerr != nil || len(cats) == 0 {
			logger.Warn("[backfill-entities] 类目拉取失败,回退占位类目",
				logger.String("region", region), logger.Err(cerr))
			cats = echotik.FallbackCategoriesL1()
		}

		// 类目集合 = 无类目主榜("") + 所有一级类目。
		catIDs := []string{""}
		for _, c := range cats {
			catIDs = append(catIDs, c.CategoryID)
		}

		for _, catID := range catIDs {
			for _, kind := range entityBackfillKinds {
				if ctx.Err() != nil {
					return fetched, skipped, ctx.Err()
				}
				cur := s.loadBackfillCursor(ctx, "entity:"+kind, region, catID)
				if cur.Completed {
					skipped++
					continue
				}
				n := s.backfillEntityCombo(ctx, kind, echotik.RanklistParams{
					Region: region, RankType: echotik.RankHot, RankField: echotik.FieldSales,
					CategoryID: catID, PageSize: entityBackfillPageSize,
				})
				fetched += n
				cur.DonePages = entityBackfillPagesPerCombo
				cur.Completed = true
				s.saveBackfillCursor(ctx, &cur)
				logger.Info("[backfill-entities] 组合完成",
					logger.String("region", region), logger.String("kind", kind),
					logger.String("category", catID), logger.Int("count", n))
			}
		}
	}
	return fetched, skipped, nil
}

// backfillEntityCombo 拉某(地区×类目×类型)前 N 页 + upsert 主表,累积 ID 写顺序表;每请求限速。返回落库条数。
func (s *DiscoverService) backfillEntityCombo(ctx context.Context, kind string, p echotik.RanklistParams) int {
	var allIDs []string
	seen := make(map[string]struct{})
	total := 0
	for page := 1; page <= entityBackfillPagesPerCombo; page++ {
		if ctx.Err() != nil {
			break
		}
		pp := p
		pp.PageNum = page
		ids, n, err := s.fetchEntityPage(ctx, kind, pp)
		s.backfillSleep(ctx, backfillReqInterval)
		if err != nil {
			logger.Warn("[backfill-entities] 拉取失败,跳到下一组合",
				logger.String("kind", kind), logger.String("region", p.Region),
				logger.String("category", p.CategoryID), logger.Int("page", page), logger.Err(err))
			break
		}
		if n == 0 {
			break
		}
		for _, id := range ids {
			if _, dup := seen[id]; !dup {
				seen[id] = struct{}{}
				allIDs = append(allIDs, id)
			}
		}
		total += n
		if n < p.PageSize {
			break // 不足一页=没有更多
		}
	}
	if len(allIDs) > 0 {
		s.writeEntityRanklist(ctx, kind, p, allIDs)
	}
	return total
}
