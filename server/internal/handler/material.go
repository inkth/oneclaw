package handler

import (
	"io"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/service"
)

const maxMaterialBytes = 50 << 20 // 50MB

type MaterialHandler struct {
	materials *service.MaterialService
	ws        *service.WorkspaceService
}

func NewMaterialHandler(m *service.MaterialService, ws *service.WorkspaceService) *MaterialHandler {
	return &MaterialHandler{materials: m, ws: ws}
}

func (h *MaterialHandler) List(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	items, err := h.materials.List(c.Request.Context(), wid, c.Query("type"))
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"materials": items})
}

func (h *MaterialHandler) Upload(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	if !h.materials.StorageReady() {
		_ = c.Error(apperr.New(apperr.CodeServiceUnavailable, "存储未配置"))
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		_ = c.Error(apperr.BadRequest("缺少文件"))
		return
	}
	if fileHeader.Size > maxMaterialBytes {
		_ = c.Error(apperr.BadRequest("文件超过 50MB 上限"))
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		_ = c.Error(apperr.BadRequest("文件读取失败"))
		return
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		_ = c.Error(apperr.BadRequest("文件读取失败"))
		return
	}

	contentType := fileHeader.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	var tags []string
	for _, t := range strings.Split(c.PostForm("tags"), ",") {
		if t = strings.TrimSpace(t); t != "" {
			tags = append(tags, t)
		}
	}
	var note *string
	if n := strings.TrimSpace(c.PostForm("note")); n != "" {
		note = &n
	}

	m, err := h.materials.Upload(c.Request.Context(), wid, service.MaterialUpload{
		OriginalName: fileHeader.Filename,
		ContentType:  contentType,
		Size:         fileHeader.Size,
		Data:         data,
		Tags:         tags,
		Note:         note,
	})
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"material": m})
}

func (h *MaterialHandler) Delete(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	mid, err := uuid.Parse(c.Param("mid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("素材 ID 无效"))
		return
	}
	if err := h.materials.Delete(c.Request.Context(), wid, mid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"deleted": true})
}
