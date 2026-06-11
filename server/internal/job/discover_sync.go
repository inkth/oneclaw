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
}

func (j *DiscoverSync) syncCombo(ctx context.Context, c config.SyncCombo) {
	cctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	start := time.Now()
	n, err := j.discover.RefreshRanklist(cctx, echotik.RanklistParams{
		Region:    c.Region,
		RankType:  c.RankType,
		RankField: c.RankField,
		PageSize:  j.cfg.PageSize,
	})
	if err != nil {
		logger.Warn("[job] 榜单同步失败",
			logger.String("region", c.Region),
			logger.Int("rankType", c.RankType),
			logger.Err(err))
		return
	}
	logger.Info("[job] 榜单同步",
		logger.String("region", c.Region),
		logger.Int("rankType", c.RankType),
		logger.Int("count", n),
		logger.String("duration", time.Since(start).Round(time.Millisecond).String()))
}
