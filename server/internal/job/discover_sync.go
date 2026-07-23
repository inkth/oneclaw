// Package job 进程内后台任务(单实例部署,time.Ticker 即可,不引入 cron)。
package job

import (
	"context"
	"fmt"
	"time"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/service"
	"github.com/faxianmao/server/internal/service/echotik"
)

// DiscoverSync 定时拉取 EchoTik 榜单落库:预热发现页缓存 + 保证每日快照连续。
type DiscoverSync struct {
	cfg      config.DiscoverSyncConfig
	discover *service.DiscoverService
	echo     *echotik.Client

	// lastSweepDay 当日类目扫完成标记(yyyy-MM-dd)。内存态:重启后当天会再扫一轮,
	// 幂等(upsert)且量小(~500 req),可接受。
	lastSweepDay string
	// lastSlowEntity 店铺/达人榜上次预热时间。内存态:重启后首轮会再预热一次,幂等可接受。
	// 视频榜跟商品节奏(每轮),店铺/达人按 EntityInterval(默认 24h)降频。
	lastSlowEntity time.Time
}

func NewDiscoverSync(cfg config.DiscoverSyncConfig, d *service.DiscoverService, e *echotik.Client) *DiscoverSync {
	return &DiscoverSync{cfg: cfg, discover: d, echo: e}
}

// Start 启动后台循环;ctx 取消即退出。启动后先跑一次(部署/重启后缓存立刻就绪),再按 Interval 周期执行。
func (j *DiscoverSync) Start(ctx context.Context) {
	if !j.cfg.Enabled {
		logger.Info("[job] 选品同步已关闭(DISCOVER_SYNC_ENABLED=false)")
		return
	}
	if !j.echo.Configured() {
		logger.Info("[job] echotik 未配置,选品同步跳过")
		return
	}
	go func() {
		// 等 HTTP 服务与数据库连接池就绪。
		select {
		case <-time.After(10 * time.Second):
		case <-ctx.Done():
			return
		}
		j.runOnce(ctx)
		ticker := time.NewTicker(j.cfg.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				j.runOnce(ctx)
			case <-ctx.Done():
				logger.Info("[job] 选品同步退出")
				return
			}
		}
	}()
	logger.Info("[job] 选品同步已启动",
		logger.String("interval", j.cfg.Interval.String()),
		logger.String("entityInterval", j.cfg.EntityInterval.String()),
		logger.Int("combos", len(j.cfg.Combos)),
		logger.Int("pageSize", j.cfg.PageSize),
		logger.Bool("categorySweep", j.cfg.CategorySweep))
}

// runOnce 串行刷新所有组合。单组合失败只告警不中断;combo 间限速防 EchoTik 限流。
func (j *DiscoverSync) runOnce(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("[job] 选品同步 panic", logger.String("err", fmt.Sprintf("%v", r)))
		}
	}()
	// 店铺/达人榜是否到期(减 5 分钟容差,防 ticker 抖动导致 24h 档永远差一点)。
	slowEntityDue := time.Since(j.lastSlowEntity) >= j.cfg.EntityInterval-5*time.Minute

	for i, c := range j.cfg.Combos {
		if ctx.Err() != nil {
			return
		}
		if i > 0 {
			select {
			case <-time.After(2 * time.Second):
			case <-ctx.Done():
				return
			}
		}
		j.syncCombo(ctx, c, slowEntityDue)
	}
	if slowEntityDue && ctx.Err() == nil {
		j.lastSlowEntity = time.Now()
	}

	// 所有榜单刷完后,刷新被收藏(tracked)且详情最旧的实体:把 EchoTik 配额优先花在用户关注的实体上。
	if ctx.Err() == nil {
		j.discover.RefreshTrackedDetails(ctx, trackedRefreshPerRun)
	}

	// 每日一轮类目扫(放最后:优先级低于默认榜预热与收藏刷新)。
	today := time.Now().Format("2006-01-02")
	if j.cfg.CategorySweep && j.lastSweepDay != today && ctx.Err() == nil {
		j.sweepCategories(ctx)
		j.lastSweepDay = today
	}

	// 选品官日报预热:榜单刷完后为各 combo 站点生成当日全类目报告(幂等,已生成即空跑;
	// 分类目报告由用户首访触发,不在此穷举)。每轮都调:唯一键保证一天最多真生成一次,
	// 且新的一天首轮同步后报告立即就绪,不用等用户来踩冷启动。
	if ctx.Err() == nil {
		for _, c := range j.cfg.Combos {
			j.discover.PrewarmDailyReport(ctx, c.Region)
		}
	}
}

// entityPrewarmPageSize 预热店铺/达人/视频三榜的条数,必须与前端各 entity 页请求的
// page_size 一致(20),否则缓存键含 page_size 不匹配、预热白做。
const entityPrewarmPageSize = 20

// trackedRefreshPerRun 每轮主动刷新的 tracked(被收藏)实体数上限(每类)。
const trackedRefreshPerRun = 10

// sweepCategories 每日类目扫:combo 站点 × 全一级类目 × 四榜第 1 页(实体三榜 20 条顺序表 +
// 商品榜 20 行主表),保证「切类目的第一屏」秒开且不超过一天陈旧。深页/非 combo 站点交给
// 用户首访 live 落库 + 读路径 SWR。约 4 站点 × 16 类目 × 8 请求 ≈ 500 请求/轮,类目间限速 2s。
func (j *DiscoverSync) sweepCategories(ctx context.Context) {
	start := time.Now()
	combos, cats := 0, 0
	for _, c := range j.cfg.Combos {
		if ctx.Err() != nil {
			return
		}
		// 每站点一个独立超时预算:16 类目 × (拉取+落库+限速) 正常 3~5 分钟,封面冷启动放宽到 20 分钟。
		cctx, cancel := context.WithTimeout(ctx, 20*time.Minute)
		for _, cat := range j.discover.Categories(cctx, c.Region) {
			if cctx.Err() != nil {
				break
			}
			p := echotik.RanklistParams{
				Region: c.Region, RankType: c.RankType, RankField: c.RankField,
				CategoryID: cat.ID, PageSize: entityPrewarmPageSize,
			}
			if err := j.discover.PrewarmEntities(cctx, p, 1); err != nil {
				logger.Warn("[job] 类目扫 entity 榜失败",
					logger.String("region", c.Region), logger.String("cat", cat.ID), logger.Err(err))
			}
			if _, err := j.discover.RefreshRanklist(cctx, p); err != nil {
				logger.Warn("[job] 类目扫商品榜失败",
					logger.String("region", c.Region), logger.String("cat", cat.ID), logger.Err(err))
			}
			cats++
			select { // 类目间限速,防 EchoTik 429
			case <-time.After(2 * time.Second):
			case <-cctx.Done():
			}
		}
		cancel()
		combos++
	}
	logger.Info("[job] 每日类目扫完成",
		logger.Int("regions", combos), logger.Int("categories", cats),
		logger.String("duration", time.Since(start).Round(time.Second).String()))
}

func (j *DiscoverSync) syncCombo(ctx context.Context, c config.SyncCombo, slowEntityDue bool) {
	// 商品榜 + 实体榜串行(视频榜还要批量签封面),留足跨境拉取时间。
	// 深页预热(160 商品=封面 32 批跨境调用,即便限并发 4)冷启动较慢,放宽到 6 分钟避免整 combo 超时回滚成 0。
	cctx, cancel := context.WithTimeout(ctx, 6*time.Minute)
	defer cancel()

	// 1. 商品榜:落库 + 每日快照 + 预热 RanklistCacheEntry(累积前 Pages 页供本地翻页)。
	start := time.Now()
	n, err := j.discover.RefreshRanklistDeep(cctx, echotik.RanklistParams{
		Region:    c.Region,
		RankType:  c.RankType,
		RankField: c.RankField,
		PageSize:  j.cfg.PageSize,
	}, j.cfg.Pages)
	if err != nil {
		logger.Warn("[job] 商品榜同步失败",
			logger.String("region", c.Region),
			logger.Int("rankType", c.RankType),
			logger.Err(err))
	} else {
		logger.Info("[job] 商品榜同步",
			logger.String("region", c.Region),
			logger.Int("rankType", c.RankType),
			logger.Int("count", n),
			logger.String("duration", time.Since(start).Round(time.Millisecond).String()))
	}

	// 2. 实体榜预热:视频榜每轮(跟商品节奏,爆款视频管线数据源要新);
	// 店铺/达人日更浏览数据,仅到期轮(EntityInterval)才拉,省 EchoTik 配额。
	// RankField 不从 combo 带入:各榜按自己的 UI 默认口径预热(见 PrewarmEntities)。
	kinds := []string{"video"}
	if slowEntityDue {
		kinds = []string{"seller", "influencer", "video"}
	}
	estart := time.Now()
	if err := j.discover.PrewarmEntities(cctx, echotik.RanklistParams{
		Region:   c.Region,
		RankType: c.RankType,
		PageSize: entityPrewarmPageSize,
	}, j.cfg.Pages, kinds...); err != nil {
		logger.Warn("[job] entity 榜预热失败",
			logger.String("region", c.Region),
			logger.Err(err))
	} else {
		logger.Info("[job] entity 榜预热",
			logger.String("region", c.Region),
			logger.Int("kinds", len(kinds)),
			logger.String("duration", time.Since(estart).Round(time.Millisecond).String()))
	}
}
