package service

import (
	"context"
	"time"

	"github.com/oneclaw/server/internal/logger"
)

// goRefresh 启动一个带 panic 兜底 + 超时的后台 goroutine,用于发现页 SWR
// (stale-while-revalidate)这类 best-effort 保鲜任务。
//
// 关键:子 goroutine 里的 panic 会带崩整个进程 —— 中间件 Recovery 只罩请求 goroutine,
// 罩不到这里。故统一在此 recover 并记录,绝不让后台刷新拖垮服务。
// 语义对齐原各调用点:脱离请求生命周期(WithoutCancel 仅继承值、断开取消),自带 90s 超时。
func goRefresh(ctx context.Context, name string, fn func(bg context.Context)) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logger.Error("[swr] 后台刷新 panic 已恢复",
					logger.String("task", name), logger.Any("panic", r))
			}
		}()
		bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), 90*time.Second)
		defer cancel()
		fn(bg)
	}()
}
