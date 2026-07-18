package handler

import (
	"github.com/gin-gonic/gin"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/middleware"
	"github.com/faxianmao/server/internal/service"
)

// AgencyHandler 代理商本人视角(user 级路由,身份挂 user 而非 workspace)。
type AgencyHandler struct {
	agency *service.AgencyService
}

func NewAgencyHandler(a *service.AgencyService) *AgencyHandler {
	return &AgencyHandler{agency: a}
}

type agencyVisitReq struct {
	InviteCode    string `json:"inviteCode" binding:"required,max=32"`
	ExistingToken string `json:"existingToken" binding:"omitempty,max=2048"`
	LandingPath   string `json:"landingPath" binding:"omitempty,max=4096"`
	UTMSource     string `json:"utmSource" binding:"omitempty,max=4096"`
	UTMMedium     string `json:"utmMedium" binding:"omitempty,max=4096"`
	UTMCampaign   string `json:"utmCampaign" binding:"omitempty,max=4096"`
	Referer       string `json:"referer" binding:"omitempty,max=4096"`
	UserAgent     string `json:"userAgent" binding:"omitempty,max=4096"`
	ClientIP      string `json:"clientIp" binding:"omitempty,max=100"`
}

// RecordVisit 供 Next /r/:code 调用：校验代理、记点击并签发首触 Cookie 凭证。
func (h *AgencyHandler) RecordVisit(c *gin.Context) {
	var in agencyVisitReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("邀请链接参数不正确"))
		return
	}
	clientIP := in.ClientIP
	if clientIP == "" {
		clientIP = c.ClientIP()
	}
	result, err := h.agency.RecordVisit(c.Request.Context(), service.AgencyVisitInput{
		InviteCode:    in.InviteCode,
		ExistingToken: in.ExistingToken,
		LandingPath:   in.LandingPath,
		UTMSource:     in.UTMSource,
		UTMMedium:     in.UTMMedium,
		UTMCampaign:   in.UTMCampaign,
		Referer:       in.Referer,
		UserAgent:     in.UserAgent,
		ClientIP:      clientIP,
	})
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, result)
}

// Summary 代理面板概览:邀请码 / 业绩 / 余额。
func (h *AgencyHandler) Summary(c *gin.Context) {
	uid, has := middleware.UserID(c)
	if !has {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	sum, err := h.agency.Summary(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"summary": sum})
}

// Customers 客户列表(脱敏手机号)。
func (h *AgencyHandler) Customers(c *gin.Context) {
	uid, has := middleware.UserID(c)
	if !has {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	cs, err := h.agency.ListCustomers(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"customers": cs})
}

// Commissions 佣金流水。
func (h *AgencyHandler) Commissions(c *gin.Context) {
	uid, has := middleware.UserID(c)
	if !has {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	recs, err := h.agency.ListCommissions(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"commissions": recs})
}

// Withdrawals 我的提现记录。
func (h *AgencyHandler) Withdrawals(c *gin.Context) {
	uid, has := middleware.UserID(c)
	if !has {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	ws, err := h.agency.ListWithdrawals(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"withdrawals": ws})
}

type createWithdrawalReq struct {
	AmountCents int    `json:"amountCents" binding:"required"`
	Note        string `json:"note"`
}

// CreateWithdrawal 发起提现申请。
func (h *AgencyHandler) CreateWithdrawal(c *gin.Context) {
	uid, has := middleware.UserID(c)
	if !has {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	var in createWithdrawalReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 amountCents"))
		return
	}
	w, err := h.agency.RequestWithdrawal(c.Request.Context(), uid, in.AmountCents, in.Note)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"withdrawal": w})
}
