package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/service"
)

type VideoHandler struct {
	videos *service.VideoService
	ws     *service.WorkspaceService
}

func NewVideoHandler(v *service.VideoService, ws *service.WorkspaceService) *VideoHandler {
	return &VideoHandler{videos: v, ws: ws}
}

func (h *VideoHandler) List(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	items, err := h.videos.List(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"videos": items})
}

func (h *VideoHandler) Create(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in service.VideoInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 prompt"))
		return
	}
	v, err := h.videos.Create(c.Request.Context(), wid, in)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"video": v})
}

func (h *VideoHandler) Delete(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	vid, err := uuid.Parse(c.Param("vid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("视频 ID 无效"))
		return
	}
	if err := h.videos.Delete(c.Request.Context(), wid, vid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"deleted": true})
}

// Retry 重新提交一条生成失败的视频(沿用原参数)。
func (h *VideoHandler) Retry(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	vid, err := uuid.Parse(c.Param("vid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("视频 ID 无效"))
		return
	}
	v, err := h.videos.Retry(c.Request.Context(), wid, vid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"video": v})
}

// Detail 取单条视频详情(含关联商品/人设/模板),供成片详情抽屉用。
func (h *VideoHandler) Detail(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	vid, err := uuid.Parse(c.Param("vid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("视频 ID 无效"))
		return
	}
	v, err := h.videos.Detail(c.Request.Context(), wid, vid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"video": v})
}

// Rerender 用一条成片的原参数克隆出新的一条(成片不满意,换一版重出)。
func (h *VideoHandler) Rerender(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	vid, err := uuid.Parse(c.Param("vid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("视频 ID 无效"))
		return
	}
	v, err := h.videos.Rerender(c.Request.Context(), wid, vid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"video": v})
}

func (h *VideoHandler) Refresh(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	vid, err := uuid.Parse(c.Param("vid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("视频 ID 无效"))
		return
	}
	v, err := h.videos.Refresh(c.Request.Context(), wid, vid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"video": v})
}
