package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/middleware"
	"github.com/faxianmao/server/internal/service"
)

// AdminHandler 管理端(仅 role=admin,路由挂 RequireAdmin)。
// admin = 运营后台聚合(看板/用户/订单/审计 + 审计化的代理写操作);agency 供代理读列表。
type AdminHandler struct {
	admin  *service.AdminService
	agency *service.AgencyService
}

func NewAdminHandler(admin *service.AdminService, agency *service.AgencyService) *AdminHandler {
	return &AdminHandler{admin: admin, agency: agency}
}

// adminID 取当前管理员 ID(路由已过 Auth + RequireAdmin,必有)。
func adminID(c *gin.Context) (uuid.UUID, bool) {
	return middleware.UserID(c)
}

func pageParam(c *gin.Context) int {
	if n, err := strconv.Atoi(c.Query("page")); err == nil && n > 0 {
		return n
	}
	return 1
}

// —— 数据看板 ————————————————————————————————————————————————————

func (h *AdminHandler) Dashboard(c *gin.Context) {
	d, err := h.admin.Dashboard(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"dashboard": d})
}

// —— 用户管理 ————————————————————————————————————————————————————

func (h *AdminHandler) ListUsers(c *gin.Context) {
	list, err := h.admin.ListUsers(c.Request.Context(), c.Query("q"), c.Query("plan"), c.Query("banned") == "1", pageParam(c))
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, list)
}

func (h *AdminHandler) UserDetail(c *gin.Context) {
	uid, err := uuid.Parse(c.Param("uid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("用户 ID 无效"))
		return
	}
	d, err := h.admin.UserDetail(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, d)
}

type banReq struct {
	Reason string `json:"reason"`
}

func (h *AdminHandler) BanUser(c *gin.Context) {
	uid, err := uuid.Parse(c.Param("uid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("用户 ID 无效"))
		return
	}
	admin, _ := adminID(c)
	var in banReq
	_ = c.ShouldBindJSON(&in)
	if err := h.admin.BanUser(c.Request.Context(), admin, uid, in.Reason); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"banned": true})
}

func (h *AdminHandler) UnbanUser(c *gin.Context) {
	uid, err := uuid.Parse(c.Param("uid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("用户 ID 无效"))
		return
	}
	admin, _ := adminID(c)
	if err := h.admin.UnbanUser(c.Request.Context(), admin, uid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"banned": false})
}

type grantCreditsReq struct {
	Credits int    `json:"credits" binding:"required"`
	Note    string `json:"note"`
}

func (h *AdminHandler) GrantCredits(c *gin.Context) {
	wid, err := uuid.Parse(c.Param("wid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("工作台 ID 无效"))
		return
	}
	var in grantCreditsReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 credits"))
		return
	}
	admin, _ := adminID(c)
	if err := h.admin.GrantCredits(c.Request.Context(), admin, wid, in.Credits, in.Note); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"granted": in.Credits})
}

type setPlanReq struct {
	Plan   string `json:"plan" binding:"required"`
	Months int    `json:"months"`
	Note   string `json:"note"`
}

func (h *AdminHandler) SetPlan(c *gin.Context) {
	wid, err := uuid.Parse(c.Param("wid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("工作台 ID 无效"))
		return
	}
	var in setPlanReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 plan"))
		return
	}
	admin, _ := adminID(c)
	if err := h.admin.SetPlan(c.Request.Context(), admin, wid, in.Plan, in.Months, in.Note); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"plan": in.Plan})
}

// —— 订单 / 账单 ——————————————————————————————————————————————————

func (h *AdminHandler) ListOrders(c *gin.Context) {
	orders, total, page, err := h.admin.ListOrders(c.Request.Context(), c.Query("status"), pageParam(c))
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"orders": orders, "total": total, "page": page, "pageSize": 20})
}

func (h *AdminHandler) ConfirmOrder(c *gin.Context) {
	oid, err := uuid.Parse(c.Param("oid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("订单 ID 无效"))
		return
	}
	admin, _ := adminID(c)
	o, err := h.admin.ConfirmOrder(c.Request.Context(), admin, oid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"order": o})
}

type refundReq struct {
	Note string `json:"note"`
}

func (h *AdminHandler) RefundOrder(c *gin.Context) {
	oid, err := uuid.Parse(c.Param("oid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("订单 ID 无效"))
		return
	}
	admin, _ := adminID(c)
	var in refundReq
	_ = c.ShouldBindJSON(&in)
	o, err := h.admin.RefundOrder(c.Request.Context(), admin, oid, in.Note)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"order": o})
}

func (h *AdminHandler) ListOverflowBills(c *gin.Context) {
	bills, total, page, err := h.admin.ListOverflowBills(c.Request.Context(), c.Query("status"), pageParam(c))
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"bills": bills, "total": total, "page": page, "pageSize": 20})
}

func (h *AdminHandler) SettleOverflowBill(c *gin.Context) {
	bid, err := uuid.Parse(c.Param("bid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("账单 ID 无效"))
		return
	}
	admin, _ := adminID(c)
	var in refundReq // 复用 {note}
	_ = c.ShouldBindJSON(&in)
	b, err := h.admin.SettleOverflowBill(c.Request.Context(), admin, bid, in.Note)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"bill": b})
}

// —— 审计日志 ————————————————————————————————————————————————————

func (h *AdminHandler) ListAuditLogs(c *gin.Context) {
	rows, total, page, err := h.admin.ListAuditLogs(c.Request.Context(), c.Query("action"), pageParam(c))
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"logs": rows, "total": total, "page": page, "pageSize": 20})
}

// —— 代理商(读走 agency,写走 admin 以留审计) —————————————————————————————

func (h *AdminHandler) Overview(c *gin.Context) {
	o, err := h.agency.AdminOverview(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"overview": o})
}

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

func (h *AdminHandler) CreateAgency(c *gin.Context) {
	var in createAgencyReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 phone"))
		return
	}
	admin, _ := adminID(c)
	ag, err := h.admin.CreateAgency(c.Request.Context(), admin, in.Phone, in.CommissionBP, in.Note)
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
	admin, _ := adminID(c)
	ag, err := h.admin.UpdateAgency(c.Request.Context(), admin, aid, in.CommissionBP, in.Status)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"agency": ag})
}

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

func (h *AdminHandler) ReviewWithdrawal(c *gin.Context) {
	wid, err := uuid.Parse(c.Param("wid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("提现 ID 无效"))
		return
	}
	admin, _ := adminID(c)
	var in reviewWithdrawalReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失"))
		return
	}
	w, err := h.admin.ReviewWithdrawal(c.Request.Context(), admin, wid, in.Approve, in.Note)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"withdrawal": w})
}
