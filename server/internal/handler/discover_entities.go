package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/oneclaw/server/internal/service/echotik"
)

// 店铺/达人/视频三榜:公开只读,无需工作台上下文。query: region & rank_type & field & page_size & date。
// field 仅 1=销量 / 2=GMV。服务层始终返回结果(失败降级 mock),故 handler 不返回错误。

func entityParams(c *gin.Context) echotik.RanklistParams {
	return echotik.RanklistParams{
		Region:     defaultStr(c.Query("region"), "US"),
		RankType:   defaultInt(c.Query("rank_type"), echotik.RankHot),
		RankField:  entityField(c.Query("field")),
		CategoryID: c.Query("category_id"),
		PageSize:   defaultInt(c.Query("page_size"), 20),
		PageNum:    pageNumParam(c),
		Date:       c.Query("date"),
		Keyword:    c.Query("keyword"),
	}
}

func entityField(v string) int {
	if v == "2" {
		return echotik.EntityFieldGMV
	}
	return echotik.EntityFieldSales
}

// SellerRanklist GET /discover/seller-ranklist
func (h *DiscoverHandler) SellerRanklist(c *gin.Context) {
	OK(c, h.discover.SellerRanklist(c.Request.Context(), entityParams(c)))
}

// InfluencerRanklist GET /discover/influencer-ranklist
func (h *DiscoverHandler) InfluencerRanklist(c *gin.Context) {
	OK(c, h.discover.InfluencerRanklist(c.Request.Context(), entityParams(c)))
}

// VideoRanklist GET /discover/video-ranklist
func (h *DiscoverHandler) VideoRanklist(c *gin.Context) {
	OK(c, h.discover.VideoRanklist(c.Request.Context(), entityParams(c)))
}

// Categories GET /discover/categories?region=US —— 一级类目筛选项。
func (h *DiscoverHandler) Categories(c *gin.Context) {
	region := defaultStr(c.Query("region"), "US")
	OK(c, gin.H{"categories": h.discover.Categories(c.Request.Context(), region)})
}

// SellerDetail GET /discover/sellers/:sellerId?region=US —— 店铺详情(公开只读)。
func (h *DiscoverHandler) SellerDetail(c *gin.Context) {
	region := defaultStr(c.Query("region"), "US")
	dto, err := h.discover.SellerDetailFull(c.Request.Context(), c.Param("sellerId"), region)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"seller": dto})
}

// InfluencerDetail GET /discover/influencers/:userId?region=US —— 达人详情(公开只读)。
func (h *DiscoverHandler) InfluencerDetail(c *gin.Context) {
	region := defaultStr(c.Query("region"), "US")
	dto, err := h.discover.InfluencerDetailFull(c.Request.Context(), c.Param("userId"), region)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"influencer": dto})
}

// VideoDetail GET /discover/videos/:videoId?region=US —— 视频详情(公开只读)。
func (h *DiscoverHandler) VideoDetail(c *gin.Context) {
	region := defaultStr(c.Query("region"), "US")
	dto, err := h.discover.VideoDetailFull(c.Request.Context(), c.Param("videoId"), region)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"video": dto})
}
