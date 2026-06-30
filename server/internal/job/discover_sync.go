// Package job 进程内后台任务(单实例部署,time.Ticker 即可,不引入 cron)。
package job

import (
	"context"
	"fmt"
	"time"

	"github.com/oneclaw/server/internal/config"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/service"
	"github.com/oneclaw/server/internal/service/echotik"
)

// DiscoverSync 定时拉取 EchoTik 榜单落库:预热发现页缓存 + 保证每日快照连续。
type DiscoverSync struct {
	cfg      config.DiscoverSyncConfig
	discover *service.DiscoverService
	echo     *echotik.Client
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
		logger.Int("combos", len(j.cfg.Combos)),
		logger.Int("pageSize", j.cfg.PageSize))
}

// runOnce 串行刷新所有组合。单组合失败只告警不中断;combo 间限速防 EchoTik 限流。
func (j *DiscoverSync) runOnce(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("[job] 选品同步 panic", logger.String("err", fmt.Sprintf("%v", r)))
		}
	}()
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
		j.syncCombo(ctx, c)
	}

	// 所有榜单刷完后,刷新被收藏(tracked)且详情最旧的实体:把 EchoTik 配额优先花在用户关注的实体上。
	if ctx.Err() == nil {
		j.discover.RefreshTrackedDetails(ctx, trackedRefreshPerRun)
	}
}

// entityPrewarmPageSize 预热店铺/达人/视频三榜的条数,必须与前端各 entity 页请求的
// page_size 一致(20),否则缓存键含 page_size 不匹配、预热白做。
const entityPrewarmPageSize = 20

// trackedRefreshPerRun 每轮主动刷新的 tracked(被收藏)实体数上限(每类)。
const trackedRefreshPerRun = 10

func (j *DiscoverSync) syncCombo(ctx context.Context, c config.SyncCombo) {
	// 商品榜 + 店铺/达人/视频三榜串行(视频榜还要批量签封面),留足跨境拉取时间。
	// 深页预热(160 商品=封面 32 批跨境调用,即便限并发 4)冷启动较慢,放宽到 6 分钟避免整 combo 超时回滚成 0。
	cctx, cancel := context.WithTimeout(ctx, 6*time.Minute)
	defer cancel()

	// 1. 商品榜:落库 + 每日快照 + 预热 RanklistCacheEntry。
	start := time.Now()
	n, err := j.discover.RefreshRanklist(cctx, echotik.RanklistParams{
		Region:    c.Region,
		RankType:  c.RankType,
		RankField: c.RankField,
		PageSize:  j.cfg.PageSize,
	})
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

	// 2. 店铺/达人/视频三榜:预热 DiscoverCache,否则每 6h TTL 过期后首个用户冷启动慢。
	estart := time.Now()
	if err := j.discover.PrewarmEntities(cctx, echotik.RanklistParams{
		Region:    c.Region,
		RankType:  c.RankType,
		RankField: c.RankField,
		PageSize:  entityPrewarmPageSize,
	}); err != nil {
		logger.Warn("[job] entity 榜预热失败",
			logger.String("region", c.Region),
			logger.Err(err))
	} else {
		logger.Info("[job] entity 榜预热",
			logger.String("region", c.Region),
			logger.String("duration", time.Since(estart).Round(time.Millisecond).String()))
	}
}
