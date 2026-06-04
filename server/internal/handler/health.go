// Package handler HTTP 入口层。每个 handler 只做参数解析 + 调用 service + 序列化响应。
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func Ready(probes ...func() error) gin.HandlerFunc {
	return func(c *gin.Context) {
		for _, p := range probes {
			if err := p(); err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"status": "down", "error": err.Error()})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	}
}
