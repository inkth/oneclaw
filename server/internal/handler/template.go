package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/service"
)

type TemplateHandler struct {
	templates *service.TemplateService
	ws        *service.WorkspaceService
}

func NewTemplateHandler(t *service.TemplateService, ws *service.WorkspaceService) *TemplateHandler {
	return &TemplateHandler{templates: t, ws: ws}
}

func (h *TemplateHandler) List(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	items, err := h.templates.List(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"templates": items})
}

func (h *TemplateHandler) Create(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in service.TemplateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	t, err := h.templates.Create(c.Request.Context(), wid, in)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"template": t})
}

func (h *TemplateHandler) Update(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("模板 ID 无效"))
		return
	}
	var patch service.TemplatePatch
	if err := c.ShouldBindJSON(&patch); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	t, err := h.templates.Update(c.Request.Context(), wid, tid, patch)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"template": t})
}

func (h *TemplateHandler) Delete(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("模板 ID 无效"))
		return
	}
	if err := h.templates.Delete(c.Request.Context(), wid, tid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"deleted": true})
}

type optimizeReq struct {
	PromptTemplate string `json:"promptTemplate" binding:"required"`
}

func (h *TemplateHandler) Optimize(c *gin.Context) {
	_, _, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in optimizeReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("缺少 promptTemplate"))
		return
	}
	out, err := h.templates.Optimize(c.Request.Context(), in.PromptTemplate)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"optimized": out})
}
