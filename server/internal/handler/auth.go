package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/faxianmao/server/internal/config"
	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/middleware"
	"github.com/faxianmao/server/internal/service"
)

type AuthHandler struct {
	auth   *service.AuthService
	ws     *service.WorkspaceService
	agency *service.AgencyService
	cookie config.CookieConfig
}

func NewAuthHandler(a *service.AuthService, ws *service.WorkspaceService, agency *service.AgencyService, cookie config.CookieConfig) *AuthHandler {
	return &AuthHandler{auth: a, ws: ws, agency: agency, cookie: cookie}
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
	Phone      string `json:"phone" binding:"required,len=11"`
	Code       string `json:"code" binding:"required,len=6"`
	InviteCode string `json:"inviteCode"` // 可选:代理商邀请码,仅首次注册时归因绑定
}

func (h *AuthHandler) Login(c *gin.Context) {
	var in loginReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失"))
		return
	}
	referralToken, _ := c.Cookie(h.cookie.ReferralName)
	res, err := h.auth.LoginByCode(c.Request.Context(), in.Phone, in.Code, in.InviteCode, referralToken)
	if err != nil {
		_ = c.Error(err)
		return
	}
	h.setSession(c, res.Token, h.auth.TokenTTLSeconds())
	h.clearReferral(c)
	OK(c, gin.H{"user": res.User, "workspace": res.Workspace})
}

func (h *AuthHandler) clearReferral(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(h.cookie.ReferralName, "", -1, "/", "", h.cookie.Secure, true)
	if h.cookie.Domain != "" {
		c.SetCookie(h.cookie.ReferralName, "", -1, "/", h.cookie.Domain, h.cookie.Secure, true)
	}
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
	role, _ := middleware.Role(c)
	// agency 非空即当前用户是代理商(前端据此显示「推广」入口);非代理为 null。
	var agencyInfo any
	if h.agency != nil {
		if ag, aerr := h.agency.GetByUser(c.Request.Context(), uid); aerr == nil && ag != nil {
			agencyInfo = gin.H{"code": ag.Code, "status": ag.Status, "commissionBp": ag.CommissionBP}
		}
	}
	OK(c, gin.H{"user": u, "workspace": ws, "role": role, "agency": agencyInfo})
}

type updateMeReq struct {
	Name *string `json:"name"`
}

// UpdateMe 目前只开放昵称。其它字段(手机号等)不走这里。
func (h *AuthHandler) UpdateMe(c *gin.Context) {
	uid, ok := middleware.UserID(c)
	if !ok {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	var in updateMeReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	if in.Name == nil {
		_ = c.Error(apperr.BadRequest("参数缺失"))
		return
	}
	u, err := h.auth.UpdateNickname(c.Request.Context(), uid, *in.Name)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"user": u})
}

func (h *AuthHandler) setSession(c *gin.Context, token string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(h.cookie.Name, token, maxAge, "/", h.cookie.Domain, h.cookie.Secure, true)
}
