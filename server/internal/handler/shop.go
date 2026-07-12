package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/service"
)

type ShopHandler struct {
	shops *service.ShopService
	ws    *service.WorkspaceService
}

func NewShopHandler(s *service.ShopService, ws *service.WorkspaceService) *ShopHandler {
	return &ShopHandler{shops: s, ws: ws}
}

func (h *ShopHandler) List(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	rows, totals, err := h.shops.List(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"shops": rows, "totals": totals})
}

func (h *ShopHandler) Create(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in service.ShopInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	sh, err := h.shops.Create(c.Request.Context(), wid, in)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"shop": sh})
}

func (h *ShopHandler) Update(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	sid, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("店铺 ID 无效"))
		return
	}
	var patch service.ShopPatch
	if err := c.ShouldBindJSON(&patch); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	sh, err := h.shops.Update(c.Request.Context(), wid, sid, patch)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"shop": sh})
}

func (h *ShopHandler) Delete(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	sid, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("店铺 ID 无效"))
		return
	}
	if err := h.shops.Delete(c.Request.Context(), wid, sid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"deleted": true})
}
