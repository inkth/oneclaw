package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/service"
)

type ModelHandler struct {
	models *service.ModelAssetService
	ws     *service.WorkspaceService
}

func NewModelHandler(m *service.ModelAssetService, ws *service.WorkspaceService) *ModelHandler {
	return &ModelHandler{models: m, ws: ws}
}

func (h *ModelHandler) List(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	items, err := h.models.List(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"models": items})
}

func (h *ModelHandler) Create(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in service.ModelInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	m, err := h.models.Create(c.Request.Context(), wid, in)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"model": m})
}

func (h *ModelHandler) Update(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	mid, err := uuid.Parse(c.Param("mid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("模特 ID 无效"))
		return
	}
	var patch service.ModelPatch
	if err := c.ShouldBindJSON(&patch); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	m, err := h.models.Update(c.Request.Context(), wid, mid, patch)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"model": m})
}

func (h *ModelHandler) Delete(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	mid, err := uuid.Parse(c.Param("mid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("模特 ID 无效"))
		return
	}
	if err := h.models.Delete(c.Request.Context(), wid, mid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"deleted": true})
}
