package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
)

// TokenValidator 由 service.AuthService 实现,解耦中间件与 service 包。
type TokenValidator interface {
	ValidateToken(token string) (userID uuid.UUID, role string, err error)
}

// Auth 从 Cookie(oc_session)或 Authorization: Bearer 取 token 校验,
// 把 user_id / user_role 写入 ctx。Cookie 优先(网页 SSR + 同域 fetch 都带 Cookie)。
func Auth(v TokenValidator, cookieName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := ""
		if ck, err := c.Cookie(cookieName); err == nil && ck != "" {
			token = ck
		} else if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
			token = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		}
		if token == "" {
			_ = c.Error(apperr.New(apperr.CodeAuthRequired, "未登录"))
			c.Abort()
			return
		}
		uid, role, err := v.ValidateToken(token)
		if err != nil {
			_ = c.Error(apperr.New(apperr.CodeInvalidToken, "无效的令牌"))
			c.Abort()
			return
		}
		c.Set(CtxUserID, uid)
		c.Set(CtxUserRole, role)
		c.Next()
	}
}

// UserID 从 ctx 取当前登录用户 ID。
func UserID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(CtxUserID)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}
