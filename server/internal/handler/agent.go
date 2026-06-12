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
	// ProductID 选品库商品 ID(可选):DIRECTOR 据此注入真实商品数据并关联产出视频。
	ProductID string `json:"productId"`
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
	var pid *uuid.UUID
	if in.ProductID != "" {
		v, err := uuid.Parse(in.ProductID)
		if err != nil {
			_ = c.Error(apperr.BadRequest("productId 无效"))
			return
		}
		pid = &v
	}
	t, err := h.agents.Create(c.Request.Context(), wid, in.Agent, in.Input, pid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"task": t})
}

type confirmVideoReq struct {
	// ModelAssetID 出镜人设(可选):预置数字人或工作台自有模特。
	ModelAssetID string `json:"modelAssetId"`
}

// ConfirmVideo 用户在任务流里确认 DIRECTOR 脚本草稿,触发真正的视频生成。
func (h *AgentHandler) ConfirmVideo(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("任务 ID 无效"))
		return
	}
	var in confirmVideoReq
	_ = c.ShouldBindJSON(&in) // body 可为空(不选人设)
	var personaID *uuid.UUID
	if in.ModelAssetID != "" {
		pid, err := uuid.Parse(in.ModelAssetID)
		if err != nil {
			_ = c.Error(apperr.BadRequest("modelAssetId 无效"))
			return
		}
		personaID = &pid
	}
	v, err := h.agents.ConfirmVideo(c.Request.Context(), wid, tid, personaID)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"video": v})
}

// GenerateImages 用户在任务流里确认 LISTING 主图方案,触发真正的出图(消耗生成额度)。
func (h *AgentHandler) GenerateImages(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("任务 ID 无效"))
		return
	}
	t, err := h.agents.GenerateListingImages(c.Request.Context(), wid, tid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"task": t})
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
