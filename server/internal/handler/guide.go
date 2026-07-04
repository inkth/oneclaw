package handler

import (
	"strings"

	"github.com/gin-gonic/gin"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/service"
)

// GuideHandler 新手指南:个性化起步路线(同步 LLM,免积分)。
// 全流程地图是前端预制内容,后端只管这一个「结合你的情况排路线」端点。
type GuideHandler struct {
	ws     *service.WorkspaceService
	agents *service.AgentService
}

func NewGuideHandler(ws *service.WorkspaceService, agents *service.AgentService) *GuideHandler {
	return &GuideHandler{ws: ws, agents: agents}
}

func (h *GuideHandler) Plan(c *gin.Context) {
	if _, _, ok := authorizeWorkspace(c, h.ws); !ok {
		return
	}

	var in struct {
		Goal string `json:"goal"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失"))
		return
	}
	goal := strings.TrimSpace(in.Goal)
	if goal == "" {
		_ = c.Error(apperr.BadRequest("先说说你的情况:预算、有没有货、想做哪个市场"))
		return
	}
	if len(goal) > 2000 {
		_ = c.Error(apperr.BadRequest("描述太长了,精简到 500 字以内"))
		return
	}

	plan, err := h.agents.GuidePlan(c.Request.Context(), goal)
	if err != nil {
		_ = c.Error(apperr.Internal("路线生成失败:"+err.Error(), err))
		return
	}
	OK(c, gin.H{"plan": plan})
}
