package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/service"
)

type ProductHandler struct {
	products *service.ProductService
	ws       *service.WorkspaceService
}

func NewProductHandler(p *service.ProductService, ws *service.WorkspaceService) *ProductHandler {
	return &ProductHandler{products: p, ws: ws}
}

func (h *ProductHandler) List(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	items, err := h.products.List(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"products": items})
}

func (h *ProductHandler) Create(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in service.ProductInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	p, err := h.products.Create(c.Request.Context(), wid, in)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"product": p})
}

func (h *ProductHandler) Update(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	pid, err := uuid.Parse(c.Param("pid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("商品 ID 无效"))
		return
	}
	var patch service.ProductPatch
	if err := c.ShouldBindJSON(&patch); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	p, err := h.products.Update(c.Request.Context(), wid, pid, patch)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"product": p})
}

func (h *ProductHandler) Delete(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	pid, err := uuid.Parse(c.Param("pid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("商品 ID 无效"))
		return
	}
	if err := h.products.Delete(c.Request.Context(), wid, pid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"deleted": true})
}

// PublishKit 出海包:一个商品的成片 + Listing 文案/主图,供「发布助手」一站式手动发布。
func (h *ProductHandler) PublishKit(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	pid, err := uuid.Parse(c.Param("pid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("商品 ID 无效"))
		return
	}
	kit, err := h.products.PublishKit(c.Request.Context(), wid, pid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"kit": kit})
}
