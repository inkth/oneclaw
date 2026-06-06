package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/service"
)

type AgentHandler struct {
	agents *service.AgentService
	ws     *service.WorkspaceService
}

func NewAgentHandler(a *service.AgentService, ws *service.WorkspaceService) *AgentHandler {
	return &AgentHandler{agents: a, ws: ws}
}

func (h *AgentHandler) List(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	items, err := h.agents.List(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"tasks": items})
}

type agentCreateReq struct {
	Agent string `json:"agent" binding:"required"`
	Input string `json:"input" binding:"required"`
}

func (h *AgentHandler) Create(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in agentCreateReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 agent 和 input"))
		return
	}
	t, err := h.agents.Create(c.Request.Context(), wid, in.Agent, in.Input)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"task": t})
}

func (h *AgentHandler) Get(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("任务 ID 无效"))
		return
	}
	t, err := h.agents.Get(c.Request.Context(), wid, tid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"task": t})
}
