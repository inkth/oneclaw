package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// OneClaw 业务成功信封 { ok:true, data:... },与现有前端 lib/api.ts 对齐。
// 错误仍走 c.Error(apperr) → ErrorHandler 中间件(返回 {code,message,...})。

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": data})
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, gin.H{"ok": true, "data": data})
}
