package handler

import (
	"github.com/gin-gonic/gin"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service"
)

// MarketingHandler 落地页公开表单:订阅 + 预约演示 + 代理商注册。无需登录。
type MarketingHandler struct {
	mk *service.MarketingService
}

func NewMarketingHandler(mk *service.MarketingService) *MarketingHandler {
	return &MarketingHandler{mk: mk}
}

type subscribeReq struct {
	Email  string  `json:"email" binding:"required,email"`
	Source *string `json:"source"`
}

func (h *MarketingHandler) Subscribe(c *gin.Context) {
	var in subscribeReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("邮箱格式不正确"))
		return
	}
	sub, err := h.mk.Subscribe(c.Request.Context(), in.Email, in.Source)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"id": sub.ID, "email": sub.Email})
}

type demoReq struct {
	Name    string  `json:"name" binding:"required"`
	Email   string  `json:"email" binding:"required,email"`
	Company *string `json:"company"`
	Message *string `json:"message"`
}

func (h *MarketingHandler) Demo(c *gin.Context) {
	var in demoReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失或邮箱格式不正确"))
		return
	}
	dr, err := h.mk.CreateDemo(c.Request.Context(), model.DemoRequest{
		Name:    in.Name,
		Email:   in.Email,
		Company: in.Company,
		Message: in.Message,
	})
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"id": dr.ID})
}

type partnerApplicationReq struct {
	Name  string `json:"name" binding:"required,max=100"`
	Phone string `json:"phone" binding:"required,len=11,numeric"`
}

func (h *MarketingHandler) RegisterPartner(c *gin.Context) {
	var in partnerApplicationReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("请填写代理商名称和 11 位手机号"))
		return
	}
	application, err := h.mk.RegisterPartner(c.Request.Context(), in.Name, in.Phone)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"id": application.ID, "status": application.Status})
}
