package middleware

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/faxianmao/server/internal/errors"
)

// TokenValidator 由 service.AuthService 实现,解耦中间件与 service 包。
type TokenValidator interface {
	ValidateToken(token string) (userID uuid.UUID, role string, err error)
}

// banChecker 可选能力:validator 若实现它,Auth 中间件会拦截已封禁账号的活跃会话
// (JWT TTL 长达 30d,登录拒绝不足以即时切断滥用者,故在鉴权热路径补一次轻量主键查)。
type banChecker interface {
	IsBanned(ctx context.Context, userID uuid.UUID) bool
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
		if bc, ok := v.(banChecker); ok && bc.IsBanned(c.Request.Context(), uid) {
			_ = c.Error(apperr.New(apperr.CodeForbidden, "账号已被封禁"))
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

// Role 从 ctx 取当前登录用户角色(JWT claims 写入,见 Auth)。
func Role(c *gin.Context) (string, bool) {
	v, ok := c.Get(CtxUserRole)
	if !ok {
		return "", false
	}
	role, ok := v.(string)
	return role, ok
}

// RequireAdmin 仅放行 role=admin。须挂在 Auth 之后(依赖 ctx 里的 role)。
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		if role, _ := Role(c); role != "admin" {
			_ = c.Error(apperr.New(apperr.CodeForbidden, "需要管理员权限"))
			c.Abort()
			return
		}
		c.Next()
	}
}
