package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/middleware"
	"github.com/oneclaw/server/internal/service"
)

// AdminHandler 管理端(仅 role=admin,路由挂 RequireAdmin)。
type AdminHandler struct {
	agency *service.AgencyService
}

func NewAdminHandler(a *service.AgencyService) *AdminHandler {
	return &AdminHandler{agency: a}
}

// Overview 业绩总览。
func (h *AdminHandler) Overview(c *gin.Context) {
	o, err := h.agency.AdminOverview(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"overview": o})
}

// ListAgencies 代理列表(含各自业绩)。
func (h *AdminHandler) ListAgencies(c *gin.Context) {
	rows, err := h.agency.AdminList(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"agencies": rows})
}

type createAgencyReq struct {
	Phone        string `json:"phone" binding:"required"`
	CommissionBP int    `json:"commissionBp"`
	Note         string `json:"note"`
}

// CreateAgency 按手机号开通代理商。
func (h *AdminHandler) CreateAgency(c *gin.Context) {
	var in createAgencyReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 phone"))
		return
	}
	ag, err := h.agency.AdminCreate(c.Request.Context(), in.Phone, in.CommissionBP, in.Note)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"agency": ag})
}

type updateAgencyReq struct {
	CommissionBP int    `json:"commissionBp"`
	Status       string `json:"status"`
}

// UpdateAgency 调佣金比例 / 停用启用。
func (h *AdminHandler) UpdateAgency(c *gin.Context) {
	aid, err := uuid.Parse(c.Param("aid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("代理 ID 无效"))
		return
	}
	var in updateAgencyReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失"))
		return
	}
	ag, err := h.agency.AdminUpdate(c.Request.Context(), aid, in.CommissionBP, in.Status)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"agency": ag})
}

// ListWithdrawals 全部提现申请(?status= 可选筛选;默认待审在前)。
func (h *AdminHandler) ListWithdrawals(c *gin.Context) {
	rows, err := h.agency.AdminListWithdrawals(c.Request.Context(), c.Query("status"))
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"withdrawals": rows})
}

type reviewWithdrawalReq struct {
	Approve bool   `json:"approve"`
	Note    string `json:"note"`
}

// ReviewWithdrawal 审核提现(通过=已线下打款 / 驳回)。
func (h *AdminHandler) ReviewWithdrawal(c *gin.Context) {
	wid, err := uuid.Parse(c.Param("wid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("提现 ID 无效"))
		return
	}
	reviewer, ok := middleware.UserID(c)
	if !ok {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	var in reviewWithdrawalReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失"))
		return
	}
	w, err := h.agency.AdminReviewWithdrawal(c.Request.Context(), wid, reviewer, in.Approve, in.Note)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"withdrawal": w})
}
