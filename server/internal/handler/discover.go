package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/service"
	"github.com/oneclaw/server/internal/service/echotik"
)

type DiscoverHandler struct {
	discover *service.DiscoverService
	ws       *service.WorkspaceService
	agents   *service.AgentService
}

func NewDiscoverHandler(d *service.DiscoverService, ws *service.WorkspaceService, agents *service.AgentService) *DiscoverHandler {
	return &DiscoverHandler{discover: d, ws: ws, agents: agents}
}

type analyzeReq struct {
	ProductID string `json:"productId" binding:"required"`
	Region    string `json:"region" binding:"required"`
}

// Analyze POST /workspaces/:wid/discover/analyze —— 对一个 discover 商品发起 AI 可行性分析。
func (h *DiscoverHandler) Analyze(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in analyzeReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 productId 和 region"))
		return
	}
	t, err := h.agents.DispatchDiscoverAnalyze(c.Request.Context(), wid, in.ProductID, in.Region)
	if err != nil {
		_ = c.Error(err)
		return
	}
	Created(c, gin.H{"task": t})
}

// Ranklist GET /workspaces/:wid/discover/ranklist?region&rank_type&product_rank_field&page_size
func (h *DiscoverHandler) Ranklist(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	p := echotik.RanklistParams{
		Region:     defaultStr(c.Query("region"), "US"),
		RankType:   defaultInt(c.Query("rank_type"), echotik.RankHot),
		RankField:  defaultInt(c.Query("product_rank_field"), echotik.FieldSales),
		CategoryID: c.Query("category_id"),
		PageSize:   defaultInt(c.Query("page_size"), 12),
		Date:       c.Query("date"),
	}
	res, err := h.discover.Ranklist(c.Request.Context(), wid, p)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, res)
}

// RanklistPublic GET /discover/ranklist —— 公共爆品榜,游客可访问(无个性化浮层)。
func (h *DiscoverHandler) RanklistPublic(c *gin.Context) {
	p := echotik.RanklistParams{
		Region:     defaultStr(c.Query("region"), "US"),
		RankType:   defaultInt(c.Query("rank_type"), echotik.RankHot),
		RankField:  defaultInt(c.Query("product_rank_field"), echotik.FieldSales),
		CategoryID: c.Query("category_id"),
		PageSize:   defaultInt(c.Query("page_size"), 12),
		Date:       c.Query("date"),
	}
	res, err := h.discover.Ranklist(c.Request.Context(), uuid.Nil, p)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, res)
}

func (h *DiscoverHandler) Interaction(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in service.InteractionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	rec, err := h.discover.UpsertInteraction(c.Request.Context(), wid, in)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"interaction": rec})
}

type importReq struct {
	ProductID     string `json:"productId" binding:"required"`
	Region        string `json:"region" binding:"required"`
	CategoryLabel string `json:"categoryLabel"`
}

func (h *DiscoverHandler) Import(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	var in importReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数不合法:" + err.Error()))
		return
	}
	res, err := h.discover.ImportProduct(c.Request.Context(), wid, in.ProductID, in.Region, in.CategoryLabel)
	if err != nil {
		_ = c.Error(err)
		return
	}
	if res.AlreadyExists {
		OK(c, res)
		return
	}
	Created(c, res)
}

// Detail GET /discover/products/:externalId?region=US —— 公共选品详情(游客可看,无个性化)。
func (h *DiscoverHandler) Detail(c *gin.Context) {
	region := defaultStr(c.Query("region"), "US")
	dto, err := h.discover.ProductDetailFull(c.Request.Context(), uuid.Nil, c.Param("externalId"), region)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"product": dto})
}

// DetailFull GET /workspaces/:wid/discover/products/:externalId?region=US —— 带工作台个性化(已导入/收藏)。
func (h *DiscoverHandler) DetailFull(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}
	region := defaultStr(c.Query("region"), "US")
	dto, err := h.discover.ProductDetailFull(c.Request.Context(), wid, c.Param("externalId"), region)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"product": dto})
}

func defaultStr(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func defaultInt(v string, def int) int {
	if v == "" {
		return def
	}
	if n, err := strconv.Atoi(v); err == nil {
		return n
	}
	return def
}
