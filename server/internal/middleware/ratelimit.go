package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/config"
	apperr "github.com/oneclaw/server/internal/errors"
)

// 进程内固定窗口限流(Phase 1 无 Redis)。单实例足够;多实例横向扩展时再换 Redis。
type memoryLimiter struct {
	mu      sync.Mutex
	windows map[string]*window
	limit   int
	period  time.Duration
}

type window struct {
	count int
	reset time.Time
}

func newMemoryLimiter(limit int, period time.Duration) *memoryLimiter {
	m := &memoryLimiter{windows: make(map[string]*window), limit: limit, period: period}
	go m.gc()
	return m
}

func (m *memoryLimiter) allow(key string) (bool, int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	w, ok := m.windows[key]
	if !ok || now.After(w.reset) {
		w = &window{count: 0, reset: now.Add(m.period)}
		m.windows[key] = w
	}
	w.count++
	remaining := m.limit - w.count
	if remaining < 0 {
		remaining = 0
	}
	return w.count <= m.limit, remaining
}

func (m *memoryLimiter) gc() {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for range t.C {
		m.mu.Lock()
		now := time.Now()
		for k, w := range m.windows {
			if now.After(w.reset) {
				delete(m.windows, k)
			}
		}
		m.mu.Unlock()
	}
}

// RateLimit 内存固定窗口限流。登录用户按 user_id,匿名按 client_ip。
func RateLimit(cfg *config.RateLimitConfig) gin.HandlerFunc {
	if !cfg.Enabled {
		return func(c *gin.Context) { c.Next() }
	}
	lim := newMemoryLimiter(cfg.RequestsPerMin, time.Minute)
	return func(c *gin.Context) {
		key := "ip:" + c.ClientIP()
		if v, ok := c.Get(CtxUserID); ok {
			if id, ok2 := v.(uuid.UUID); ok2 {
				key = "u:" + id.String()
			}
		}
		allowed, remaining := lim.allow(key)
		c.Header("X-RateLimit-Limit", strconv.Itoa(cfg.RequestsPerMin))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		if !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, apperr.Response{
				Code:      apperr.CodeTooManyRequest,
				Message:   "请求过于频繁,请稍候再试",
				RequestID: c.GetString(CtxRequestID),
			})
			return
		}
		c.Next()
	}
}
