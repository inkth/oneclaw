// Package middleware 集中 oneclaw-server 的 HTTP 中间件。
package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
)

const (
	HeaderRequestID = "X-Request-ID"
	HeaderTraceID   = "X-Trace-ID"

	CtxRequestID = "request_id"
	CtxTraceID   = "trace_id"
	CtxUserID    = "user_id"
	CtxUserRole  = "user_role"
)

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				logger.Error("panic recovered",
					zap.Any("panic", r),
					zap.String("path", c.Request.URL.Path),
					zap.String("request_id", c.GetString(CtxRequestID)),
				)
				c.AbortWithStatusJSON(http.StatusInternalServerError, apperr.Response{
					Code:      apperr.CodeInternal,
					Message:   "服务器内部错误",
					RequestID: c.GetString(CtxRequestID),
				})
			}
		}()
		c.Next()
	}
}

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		rid := c.GetHeader(HeaderRequestID)
		if rid == "" {
			rid = uuid.New().String()
		}
		c.Set(CtxRequestID, rid)
		c.Header(HeaderRequestID, rid)
		c.Next()
	}
}

func Trace() gin.HandlerFunc {
	return func(c *gin.Context) {
		tid := c.GetHeader(HeaderTraceID)
		if tid == "" {
			tid = uuid.New().String()
		}
		c.Set(CtxTraceID, tid)
		c.Header(HeaderTraceID, tid)
		c.Next()
	}
}

func Logging() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		latency := time.Since(start)
		fields := []zap.Field{
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", latency),
			zap.String("ip", c.ClientIP()),
			zap.String("request_id", c.GetString(CtxRequestID)),
		}
		switch {
		case c.Writer.Status() >= 500:
			logger.Error("http", fields...)
		case c.Writer.Status() >= 400:
			logger.Warn("http", fields...)
		default:
			logger.Info("http", fields...)
		}
	}
}

// ErrorHandler 拦截 c.Error(...),统一序列化为 apperr.Response。
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if len(c.Errors) == 0 {
			return
		}
		err := c.Errors.Last().Err
		rid := c.GetString(CtxRequestID)
		if ae, ok := apperr.As(err); ok {
			c.AbortWithStatusJSON(ae.HTTPStatus, apperr.Response{
				Code:      ae.Code,
				Message:   ae.Message,
				Details:   ae.Details,
				RequestID: rid,
			})
			return
		}
		c.AbortWithStatusJSON(http.StatusInternalServerError, apperr.Response{
			Code:      apperr.CodeInternal,
			Message:   "服务器内部错误",
			Details:   fmt.Sprintf("%v", err),
			RequestID: rid,
		})
	}
}

// CORS 带凭证跨域。因为要发 Cookie,Allow-Origin 必须是具体来源(不能 *),
// 并附 Allow-Credentials:true。同域(nginx)生产环境基本走不到这里。
func CORS(allowed []string) gin.HandlerFunc {
	allowSet := make(map[string]bool, len(allowed))
	for _, o := range allowed {
		allowSet[o] = true
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && allowSet[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-ID,X-Trace-ID")
			c.Header("Access-Control-Expose-Headers", "X-Request-ID,X-Trace-ID,X-RateLimit-Remaining")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
