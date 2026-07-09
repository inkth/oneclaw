package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/oneclaw/server/internal/service/echotik"
)

// 店铺/达人/视频三榜:公开只读,无需工作台上下文。query: region & rank_type & field & page_size & date。
// field 语义随榜单不同(见 echotik 包枚举注释),选品默认:店铺=热销、达人/视频=带货。
// 服务层始终返回结果(失败降级 mock),故 handler 不返回错误。

func entityParams(c *gin.Context, defaultField int) echotik.RanklistParams {
	return echotik.RanklistParams{
		Region:     defaultStr(c.Query("region"), "US"),
		RankType:   defaultInt(c.Query("rank_type"), echotik.RankHot),
		RankField:  entityField(c.Query("field"), defaultField),
		CategoryID: c.Query("category_id"),
		PageSize:   defaultInt(c.Query("page_size"), 20),
		PageNum:    pageNumParam(c),
		Date:       c.Query("date"),
		Keyword:    c.Query("keyword"),
		// 仅视频榜前端会传;店铺/达人榜不发此参数(即便传了上游也忽略)。
		CreatedByAI: c.Query("created_by_ai"),
	}
}

func entityField(v string, def int) int {
	switch v {
	case "1":
		return 1
	case "2":
		return 2
	}
	return def
}

// SellerRanklist GET /discover/seller-ranklist —— 默认热销榜(total_sale_cnt)。
func (h *DiscoverHandler) SellerRanklist(c *gin.Context) {
	OK(c, h.discover.SellerRanklist(c.Request.Context(), entityParams(c, echotik.SellerFieldSales)))
}

// InfluencerRanklist GET /discover/influencer-ranklist —— 默认带货榜(total_sale_cnt),非粉丝榜。
func (h *DiscoverHandler) InfluencerRanklist(c *gin.Context) {
	OK(c, h.discover.InfluencerRanklist(c.Request.Context(), entityParams(c, echotik.InfluencerFieldSales)))
}

// VideoRanklist GET /discover/video-ranklist —— 默认带货榜(total_video_sale_cnt),非播放热门榜。
func (h *DiscoverHandler) VideoRanklist(c *gin.Context) {
	OK(c, h.discover.VideoRanklist(c.Request.Context(), entityParams(c, echotik.VideoFieldSales)))
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
