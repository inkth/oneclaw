package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// 选品板块四榜的 kind 标识(与 EntityRanklistEntry.Kind / 游标 Kind 对齐)。
const (
	boardProduct    = "product"
	boardSeller     = "seller"
	boardInfluencer = "influencer"
	boardVideo      = "video"
)

// BackfillKindsAll 整个选品板块四榜;BackfillKindsProductOnly 仅商品(--backfill-products 兼容)。
var (
	BackfillKindsAll         = []string{boardProduct, boardSeller, boardInfluencer, boardVideo}
	BackfillKindsProductOnly = []string{boardProduct}
)

// backfillRegions 取「前端 regions.ts 站点 ∩ EchoTik 支持站点」。EchoTik 白名单
// (2026-07 实测 code 500 报错回显):US|ID|TH|PH|MY|VN|GB|MX|SG|SA|BR|ES|DE|FR|JP|IT。
// 前端有 IE(爱尔兰)但 EchoTik 不支持(整站 500),故不在此列;SA 反之(EchoTik 有、前端没有)。
// 可用 BACKFILL_PRODUCTS_REGIONS=US,GB,... 覆盖(逗号分隔)。
var backfillRegions = []string{
	"US", "GB", "ID", "TH", "VN", "MY", "PH", "SG",
	"ES", "MX", "DE", "FR", "IT", "BR", "JP",
}

const (
	// 页粒度=前端页(20 条),与 entity 页请求 / 预热 / live 兜底同构——顺序表一条 20 id,
	// 前端分页(rows>=20 才有下一页)才能正常工作。EchoTik 上限 10/页,客户端内部并发拉 2 页拼一屏。
	backfillPagesPerCombo = 1  // 每个(地区×类目)灌前端第 1 页;第 2 页起用户首访 live 落库 + SWR 保鲜
	backfillPageSize      = 20 // 前端页大小(= entityPrewarmPageSize)
)

// backfillReqInterval 每"前端页"含 2 次 EchoTik 请求,间隔 2s 保持均值 1 req/s(防限流);测试里调小以免干等。
var backfillReqInterval = 2 * time.Second

// BackfillDiscover 遍历所有站点 × 所有一级类目 × 前端第 1 页,把 kinds 指定的榜单数据落库:
//   - 商品榜:只回填「具体类目」(全部类目由定时 job 维护——RanklistCacheEntry 无页维度,多页会互相覆盖)。
//   - 店铺/达人/视频三榜:回填「全部类目 + 各具体类目」,落 EntityRanklistEntry(页维度),读路径据此本地分页。
//
// 全量一轮 ≈ 16 站点 × (商品 16 类目 + 三榜 17 类目) × 2 请求 ≈ 2200 次、约 36 分钟。
// DiscoverBackfillCursor 按 (kind, region, category) 记录进度,
// 已完成组合/已拉页直接跳过 → 可中断重跑(已有数据不再请求)。封面不在此补取,交给 --backfill-covers。
func (s *DiscoverService) BackfillDiscover(ctx context.Context, kinds []string) (fetched, skipped int, err error) {
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
			logger.Warn("[backfill] 类目拉取失败,回退占位类目",
				logger.String("region", region), logger.Err(cerr))
			cats = echotik.FallbackCategoriesL1()
		}
		catIDs := make([]string, 0, len(cats))
		for _, c := range cats {
			if c.CategoryID != "" {
				catIDs = append(catIDs, c.CategoryID)
			}
		}

		for _, kind := range kinds {
			// 实体榜额外含「全部类目」("")——默认榜视图也本地化;商品榜不含(见函数注释)。
			combos := catIDs
			if kind != boardProduct {
				combos = append([]string{""}, catIDs...)
			}
			for _, cat := range combos {
				if ctx.Err() != nil {
					return fetched, skipped, ctx.Err()
				}
				n, sk := s.backfillCombo(ctx, kind, region, cat)
				fetched += n
				skipped += sk
			}
		}
	}
	return fetched, skipped, nil
}

// backfillCombo 回填单个 (kind, region, category) 组合的前 backfillPagesPerCombo 个前端页;
// 返回该组合落库行数与跳过组合数(0/1)。
func (s *DiscoverService) backfillCombo(ctx context.Context, kind, region, cat string) (fetched, skipped int) {
	cur := s.loadBackfillCursor(ctx, kind, region, cat)
	if cur.Completed {
		return 0, 1
	}
	for page := cur.DonePages + 1; page <= backfillPagesPerCombo; page++ {
		if ctx.Err() != nil {
			return fetched, 0
		}
		n, rerr := s.backfillPage(ctx, kind, region, cat, page)
		s.backfillSleep(ctx, backfillReqInterval)
		if rerr != nil {
			// 本组合本轮中断;cursor 不前进,下次重跑从该页续上。
			logger.Warn("[backfill] 拉取失败,跳到下一组合",
				logger.String("kind", kind), logger.String("region", region),
				logger.String("category", cat), logger.Int("page", page), logger.Err(rerr))
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
	logger.Info("[backfill] 组合完成",
		logger.String("kind", kind), logger.String("region", region),
		logger.String("category", cat), logger.Int("donePages", cur.DonePages))
	return fetched, 0
}

// backfillRankField 各榜回填用的排序字段,必须与 handler 默认读一致,否则顺序表键
// (rank_field)对不上、回填白做。field 语义随榜单不同,见 echotik 包枚举注释。
func backfillRankField(kind string) int {
	switch kind {
	case boardInfluencer:
		return echotik.InfluencerFieldSales
	case boardVideo:
		return echotik.VideoFieldSales
	default: // product/seller: 1=销量
		return echotik.FieldSales
	}
}

// backfillPage 拉某榜单单页并落库,返回该页行数。商品榜走 RefreshRanklist(类目路径只 upsert 行);
// 三榜各自 upsert 主表+当日快照,并按页写 EntityRanklistEntry 顺序。
func (s *DiscoverService) backfillPage(ctx context.Context, kind, region, cat string, page int) (int, error) {
	p := echotik.RanklistParams{
		Region:     region,
		RankType:   echotik.RankHot,
		RankField:  backfillRankField(kind), // 与各榜默认读对齐(店铺/商品=销量,达人/视频=带货)
		CategoryID: cat,
		PageNum:    page,
		PageSize:   backfillPageSize,
	}
	switch kind {
	case boardProduct:
		return s.RefreshRanklist(ctx, p)
	case boardSeller:
		raw, err := s.echo.GetSellerRanklist(ctx, p)
		if err != nil {
			return 0, err
		}
		if len(raw) > 0 {
			s.upsertSellerList(ctx, region, raw)
			s.writeEntityRanklist(ctx, boardSeller, p, sellerIDsOf(raw))
		}
		return len(raw), nil
	case boardInfluencer:
		raw, err := s.echo.GetInfluencerRanklist(ctx, p)
		if err != nil {
			return 0, err
		}
		if len(raw) > 0 {
			s.upsertInfluencerList(ctx, region, raw)
			s.writeEntityRanklist(ctx, boardInfluencer, p, influencerIDsOf(raw))
		}
		return len(raw), nil
	case boardVideo:
		raw, err := s.echo.GetVideoRanklist(ctx, p)
		if err != nil {
			return 0, err
		}
		if len(raw) > 0 {
			s.upsertVideoList(ctx, region, raw)
			s.writeEntityRanklist(ctx, boardVideo, p, videoIDsOf(raw))
		}
		return len(raw), nil
	}
	return 0, fmt.Errorf("未知榜单类型: %s", kind)
}

// backfillSleep 限速;ctx 取消即提前返回。
func (s *DiscoverService) backfillSleep(ctx context.Context, d time.Duration) {
	select {
	case <-time.After(d):
	case <-ctx.Done():
	}
}

func (s *DiscoverService) loadBackfillCursor(ctx context.Context, kind, region, categoryID string) model.DiscoverBackfillCursor {
	var c model.DiscoverBackfillCursor
	s.db.WithContext(ctx).
		Where("provider = ? AND kind = ? AND region = ? AND category_id = ?", providerEchoTik, kind, region, categoryID).
		First(&c)
	// 不存在时为零值;补齐键字段供后续 upsert。
	c.Provider, c.Kind, c.Region, c.CategoryID = providerEchoTik, kind, region, categoryID
	return c
}

func (s *DiscoverService) saveBackfillCursor(ctx context.Context, c *model.DiscoverBackfillCursor) {
	c.UpdatedAt = time.Now()
	s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "provider"}, {Name: "kind"}, {Name: "region"}, {Name: "category_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"done_pages", "completed", "updated_at"}),
	}).Create(c)
}
