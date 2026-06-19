package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/service"
)

type BillingHandler struct {
	billing *service.BillingService
	quota   *service.QuotaService
	ws      *service.WorkspaceService
}

func NewBillingHandler(b *service.BillingService, q *service.QuotaService, ws *service.WorkspaceService) *BillingHandler {
	return &BillingHandler{billing: b, quota: q, ws: ws}
}

// Usage 当月用量 + 方案信息(settings 页 / 额度提示用)。
func (h *BillingHandler) Usage(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	u, err := h.quota.Usage(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"usage": u})
}

// Checkout 生成订阅支付订单(返回二维码内容,前端渲染扫码)。
func (h *BillingHandler) Checkout(c *gin.Context) {
	uid, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in service.CheckoutInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 plan / periodMonths / provider"))
		return
	}
	o, err := h.billing.Checkout(c.Request.Context(), wid, uid, in)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"order": o, "isMock": o.IsMock})
}

// GetOrder 查单(前端轮询支付状态)。
func (h *BillingHandler) GetOrder(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	oid, err := uuid.Parse(c.Param("oid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("订单 ID 无效"))
		return
	}
	o, err := h.billing.GetOrder(c.Request.Context(), wid, oid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"order": o})
}

// MockConfirm 模拟支付成功(仅 dev),联调升级链路。
func (h *BillingHandler) MockConfirm(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	oid, err := uuid.Parse(c.Param("oid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("订单 ID 无效"))
		return
	}
	o, err := h.billing.MockConfirm(c.Request.Context(), wid, oid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"order": o})
}

// OverflowBills 列出本工作台的 TEAM 超额账单(对账/结算查看)。
func (h *BillingHandler) OverflowBills(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	bills, err := h.billing.ListOverflowBills(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"bills": bills})
}

// MockSettleOverflow 模拟超额账单结算(仅 dev),联调出账→结清闭环。
func (h *BillingHandler) MockSettleOverflow(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	bid, err := uuid.Parse(c.Param("bid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("账单 ID 无效"))
		return
	}
	bill, err := h.billing.MockSettleOverflow(c.Request.Context(), wid, bid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"bill": bill})
}
