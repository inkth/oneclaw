package handler

import (
	"strings"

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
	// ConversationID 归属会话 ID(可选):传了则追加进该会话,空则后端新建一条。
	ConversationID string `json:"conversationId"`
	// ProductID 选品库商品 ID(可选):DIRECTOR/LISTING 据此注入真实商品数据并关联产出。
	ProductID string `json:"productId"`
	// ModelAssetID 出镜人设 ID(可选,DIRECTOR):脚本贴合人设,确认出片时默认沿用。
	ModelAssetID string `json:"modelAssetId"`
	// MaterialID 素材库图片 ID(可选):视频首帧 / Listing 出图参考。
	MaterialID string `json:"materialId"`
	// Region 目标市场(可选,DIRECTOR):定口播语言;空则跟随商品来源市场,兜底 US。
	Region string `json:"region"`
	// DurationSec 视频时长秒(可选,DIRECTOR):用户在「设置」显式锁的优先于 AI 自选,夹 4-15s;0/缺省=AI 自定。
	DurationSec int `json:"durationSec"`
	// AspectRatio 画幅比例(可选,DIRECTOR):9:16 / 16:9 / 1:1;空=默认 9:16。
	AspectRatio string `json:"aspectRatio"`
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
	parseOpt := func(raw, label string) (*uuid.UUID, bool) {
		if raw == "" {
			return nil, true
		}
		v, err := uuid.Parse(raw)
		if err != nil {
			_ = c.Error(apperr.BadRequest(label + " 无效"))
			return nil, false
		}
		return &v, true
	}
	var opts service.AgentCreateOpts
	var valid bool
	if opts.ConversationID, valid = parseOpt(in.ConversationID, "conversationId"); !valid {
		return
	}
	if opts.ProductID, valid = parseOpt(in.ProductID, "productId"); !valid {
		return
	}
	if opts.PersonaID, valid = parseOpt(in.ModelAssetID, "modelAssetId"); !valid {
		return
	}
	if opts.MaterialID, valid = parseOpt(in.MaterialID, "materialId"); !valid {
		return
	}
	opts.Region = in.Region
	// 时长/比例非法值不报错:由 service 的 clampDuration/normalizeAspect 静默回退,和 region 一致。
	opts.DurationSec = in.DurationSec
	opts.AspectRatio = in.AspectRatio
	t, err := h.agents.Create(c.Request.Context(), wid, in.Agent, in.Input, opts)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"task": t})
}

type listingBatchReq struct {
	// MaterialIDs 已上传到素材库的商品图 ID 列表(每张 → 一张自建商品卡 + 一个 LISTING 任务)。
	MaterialIDs []string `json:"materialIds" binding:"required"`
	// Prompt 可选补充说明(留空用默认看图指令)。
	Prompt string `json:"prompt"`
}

// ListingBatch 批量「把我拍的商品图变成商品」:多图一次扇出建商品卡 + 文案+主图一起出。
func (h *AgentHandler) ListingBatch(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in listingBatchReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 materialIds"))
		return
	}
	ids := make([]uuid.UUID, 0, len(in.MaterialIDs))
	for _, raw := range in.MaterialIDs {
		v, err := uuid.Parse(strings.TrimSpace(raw))
		if err != nil {
			_ = c.Error(apperr.BadRequest("materialId 无效:" + raw))
			return
		}
		ids = append(ids, v)
	}
	res, err := h.agents.CreateListingBatch(c.Request.Context(), wid, ids, in.Prompt)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"batch": res})
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

type redraftReq struct {
	// Region 新的目标市场 code,必填;脚本将用该市场母语重写口播。
	Region string `json:"region" binding:"required"`
}

// RedraftVideo 确认卡上改目标市场,用新市场母语重写脚本草稿(不消耗视频额度)。
func (h *AgentHandler) RedraftVideo(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("任务 ID 无效"))
		return
	}
	var in redraftReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 region"))
		return
	}
	t, err := h.agents.RedraftVideoScript(c.Request.Context(), wid, tid, in.Region)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"task": t})
}

type rewriteReq struct {
	// Instruction 可选的一句话调整指令;留空 = 直接换一版(重新生成草稿)。
	Instruction string `json:"instruction"`
}

// RewriteVideo 确认卡上「一句话重写」:沿用当前市场/商品/人设,按可选指令重生成脚本草稿(不消耗视频额度)。
func (h *AgentHandler) RewriteVideo(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("任务 ID 无效"))
		return
	}
	var in rewriteReq
	_ = c.ShouldBindJSON(&in) // body 可为空(直接换一版)
	t, err := h.agents.RewriteVideoScript(c.Request.Context(), wid, tid, in.Instruction)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"task": t})
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

// Retry 重跑一条失败的 Agent 任务(沿用原指令与 metadata 还原的派活选项,重占额度)。
func (h *AgentHandler) Retry(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	tid, err := uuid.Parse(c.Param("tid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("任务 ID 无效"))
		return
	}
	t, err := h.agents.Retry(c.Request.Context(), wid, tid)
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

// ── 会话(Conversation)─────────────────────────────────────────────────────

func (h *AgentHandler) ListConversations(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	items, err := h.agents.ListConversations(c.Request.Context(), wid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"conversations": items})
}

func (h *AgentHandler) ConversationTasks(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	cid, err := uuid.Parse(c.Param("cid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("会话 ID 无效"))
		return
	}
	items, err := h.agents.ListConversationTasks(c.Request.Context(), wid, cid)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"tasks": items})
}

type conversationRenameReq struct {
	Title string `json:"title" binding:"required"`
}

func (h *AgentHandler) RenameConversation(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	cid, err := uuid.Parse(c.Param("cid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("会话 ID 无效"))
		return
	}
	var in conversationRenameReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 title"))
		return
	}
	conv, err := h.agents.RenameConversation(c.Request.Context(), wid, cid, in.Title)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"conversation": conv})
}

func (h *AgentHandler) DeleteConversation(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	cid, err := uuid.Parse(c.Param("cid"))
	if err != nil {
		_ = c.Error(apperr.BadRequest("会话 ID 无效"))
		return
	}
	if err := h.agents.DeleteConversation(c.Request.Context(), wid, cid); err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"ok": true})
}
