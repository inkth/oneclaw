package job

import (
	"context"
	"fmt"
	"time"

	"github.com/oneclaw/server/internal/config"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/service"
)

// OverflowSettle 定时把 TEAM 上一账期的超基线用量出账(生成待结算账单)。
// 进程内单实例,time.Ticker 即可(与 DiscoverSync 同构,不引入外部 cron)。
type OverflowSettle struct {
	cfg     config.OverflowSettleConfig
	billing *service.BillingService
}

func NewOverflowSettle(cfg config.OverflowSettleConfig, b *service.BillingService) *OverflowSettle {
	return &OverflowSettle{cfg: cfg, billing: b}
}

// Start 启动后台循环;ctx 取消即退出。
// 出账是幂等的(账单按「工作台×周期」唯一),所以不需要精确卡在周期边界:
// 启动先补跑一次(自愈停机期间漏结的周期),之后按 Interval 粗粒度轮询即可——
// 各工作台订阅周期结束后,首个 tick 自然把刚结束的周期结清,周期内重复跑都是空转。
func (j *OverflowSettle) Start(ctx context.Context) {
	if !j.cfg.Enabled {
		logger.Info("[job] TEAM 超额结算已关闭(OVERFLOW_SETTLE_ENABLED=false)")
		return
	}
	go func() {
		// 等数据库连接池就绪(与 DiscoverSync 一致的启动让路)。
		select {
		case <-time.After(30 * time.Second):
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
				logger.Info("[job] TEAM 超额结算退出")
				return
			}
		}
	}()
	logger.Info("[job] TEAM 超额结算已启动", logger.String("interval", j.cfg.Interval.String()))
}

func (j *OverflowSettle) runOnce(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("[job] TEAM 超额结算 panic", logger.String("err", fmt.Sprintf("%v", r)))
		}
	}()
	cctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	n, err := j.billing.SettleDueCycles(cctx, time.Now())
	if err != nil {
		logger.Warn("[job] TEAM 超额结算失败", logger.Err(err))
		return
	}
	if n > 0 {
		logger.Info("[job] TEAM 超额结算完成", logger.Int("bills", n))
	}
}
