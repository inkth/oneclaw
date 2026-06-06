package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/middleware"
	"github.com/oneclaw/server/internal/service"
)

type WorkspaceHandler struct {
	ws *service.WorkspaceService
}

func NewWorkspaceHandler(ws *service.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{ws: ws}
}

func (h *WorkspaceHandler) GetDefault(c *gin.Context) {
	uid, ok := middleware.UserID(c)
	if !ok {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return
	}
	ws, err := h.ws.GetDefault(c.Request.Context(), uid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"workspace": ws})
}

// authorizeWorkspace 读 :wid 参数,校验当前用户是该工作台成员。
// 失败时已写入 c.Error,调用方应直接 return。
func authorizeWorkspace(c *gin.Context, ws *service.WorkspaceService) (userID, wsID uuid.UUID, ok bool) {
	uid, has := middleware.UserID(c)
	if !has {
		_ = c.Error(apperr.Unauthorized("未登录"))
		return uuid.Nil, uuid.Nil, false
	}
	wid, err := uuid.Parse(c.Param("wid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("工作台 ID 无效"))
		return uuid.Nil, uuid.Nil, false
	}
	if _, err := ws.Authorize(c.Request.Context(), uid, wid); err != nil {
		_ = c.Error(err)
		return uuid.Nil, uuid.Nil, false
	}
	return uid, wid, true
}
