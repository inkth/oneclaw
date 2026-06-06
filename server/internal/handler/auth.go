package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/oneclaw/server/internal/config"
	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/middleware"
	"github.com/oneclaw/server/internal/service"
)

type AuthHandler struct {
	auth   *service.AuthService
	ws     *service.WorkspaceService
	cookie config.CookieConfig
}

func NewAuthHandler(a *service.AuthService, ws *service.WorkspaceService, cookie config.CookieConfig) *AuthHandler {
	return &AuthHandler{auth: a, ws: ws, cookie: cookie}
}

type sendCodeReq struct {
	Phone string `json:"phone" binding:"required,len=11"`
}

func (h *AuthHandler) SendCode(c *gin.Context) {
	var in sendCodeReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("手机号格式不正确"))
		return
	}
	devCode, err := h.auth.SendCode(c.Request.Context(), in.Phone)
	if err != nil {
		_ = c.Error(err)
		return
	}
	data := gin.H{"expiresInSec": 300}
	if devCode != "" {
		data["devCode"] = devCode
	}
	OK(c, data)
}

type loginReq struct {
	Phone string `json:"phone" binding:"required,len=11"`
	Code  string `json:"code" binding:"required,len=6"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var in loginReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失"))
		return
	}
	res, err := h.auth.LoginByCode(c.Request.Context(), in.Phone, in.Code)
	if err != nil {
		_ = c.Error(err)
		return
	}
	h.setSession(c, res.Token, h.auth.TokenTTLSeconds())
	OK(c, gin.H{"user": res.User, "workspace": res.Workspace})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	h.setSession(c, "", -1)
	OK(c, gin.H{"loggedOut": true})
}

func (h *AuthHandler) Me(c *gin.Context) {
	uid, ok := middleware.UserID(c)
	if !ok {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	u, err := h.auth.GetUser(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	ws, err := h.ws.GetDefault(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"user": u, "workspace": ws})
}

func (h *AuthHandler) setSession(c *gin.Context, token string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(h.cookie.Name, token, maxAge, "/", h.cookie.Domain, h.cookie.Secure, true)
}
