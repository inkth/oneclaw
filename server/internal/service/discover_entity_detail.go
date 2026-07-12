package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// ── 店铺详情 DTO ──────────────────────────────────────────────────────────────

type SellerDetailDTO struct {
	SellerID          string             `json:"sellerId"`
	SellerName        string             `json:"sellerName"`
	Region            string             `json:"region"`
	Cover             string             `json:"cover"` // 已签名
	SellerLink        string             `json:"sellerLink"`
	Rating            float64            `json:"rating"`
	Categories        []string           `json:"categories"`
	AvgPriceCents     int                `json:"avgPriceCents"`
	TotalProductCnt   int                `json:"totalProductCnt"`
	TotalSaleCnt      int                `json:"totalSaleCnt"`
	TotalSaleGmvCents int                `json:"totalSaleGmvCents"`
	TotalIflCnt       int                `json:"totalIflCnt"`
	TotalVideoCnt     int                `json:"totalVideoCnt"`
	TotalLiveCnt      int                `json:"totalLiveCnt"`
	Windows           *EntityWindowsDTO  `json:"windows"`
	Products          []EntityProductDTO `json:"products"`
	Trend             []TrendPointDTO    `json:"trend"`
}

type EntityWindowsDTO struct {
	Sale7dCnt   int `json:"sale7dCnt"`
	Sale30dCnt  int `json:"sale30dCnt"`
	Gmv7dCents  int `json:"gmv7dCents"`
	Gmv30dCents int `json:"gmv30dCents"`
}

type EntityProductDTO struct {
	ProductID      string  `json:"productId"`
	Name           string  `json:"name"`
	Cover          string  `json:"cover"` // 已签名
	AvgPriceCents  int     `json:"avgPriceCents"`
	CommissionRate float64 `json:"commissionRate"`
	Rating         float64 `json:"rating"`
}

// ── 达人详情 DTO ──────────────────────────────────────────────────────────────

type InfluencerDetailDTO struct {
	UserID            string               `json:"userId"`
	UniqueID          string               `json:"uniqueId"`
	NickName          string               `json:"nickName"`
	Region            string               `json:"region"`
	Avatar            string               `json:"avatar"` // 已签名
	Category          string               `json:"category"`
	Gender            string               `json:"gender"`
	Language          string               `json:"language"`
	ContactEmail      string               `json:"contactEmail"`
	Signature         string               `json:"signature"`
	EcScore           float64              `json:"ecScore"`
	InteractionRate   float64              `json:"interactionRate"`
	Followers         int                  `json:"followers"`
	Followers30d      int                  `json:"followers30d"`
	PostVideoCnt      int                  `json:"postVideoCnt"`
	ProductCnt        int                  `json:"productCnt"`
	TotalSaleCnt      int                  `json:"totalSaleCnt"`
	TotalSaleGmvCents int                  `json:"totalSaleGmvCents"`
	TotalViewsCnt     int                  `json:"totalViewsCnt"`
	TotalDiggCnt      int                  `json:"totalDiggCnt"`
	Videos            []InfluencerVideoDTO `json:"videos"`
	Trend             []InfluencerTrendDTO `json:"trend"`
}

type InfluencerVideoDTO struct {
	VideoID      string `json:"videoId"`
	UniqueID     string `json:"uniqueId"`
	Cover        string `json:"cover"` // 已签名
	Desc         string `json:"desc"`
	IsAd         bool   `json:"isAd"`
	Views        int    `json:"views"`
	Digg         int    `json:"digg"`
	Comments     int    `json:"comments"`
	Shares       int    `json:"shares"`
	CreateTime   string `json:"createTime"`
	SaleCnt      int    `json:"saleCnt"`
	SaleGmvCents int    `json:"saleGmvCents"`
}

type InfluencerTrendDTO struct {
	Dt           string `json:"dt"`
	Followers    int    `json:"followers"`
	NewFollowers int    `json:"newFollowers"`
	SaleCnt      int    `json:"saleCnt"`
	GmvCents     int    `json:"gmvCents"`
}

// ── 店铺详情入口 ──────────────────────────────────────────────────────────────

// SellerDetailFull 店铺详情:读 DB 优先 + 按 detail_fetched_at 条件刷新(同 InfluencerDetailFull 四档)。
// 趋势来自本地累计快照差分(sellerTrendFromSnapshots),不再实时打 EchoTik trend。
func (s *DiscoverService) SellerDetailFull(ctx context.Context, sellerID, region string) (*SellerDetailDTO, error) {
	var ds model.DiscoverSeller
	found := false
	if s.db != nil {
		found = s.db.WithContext(ctx).
			Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, sellerID, region).
			First(&ds).Error == nil
	}
	fresh := found && !ds.DetailFetchedAt.IsZero() && time.Since(ds.DetailFetchedAt) < detailTTLFor(ds.IsTracked)
	if fresh {
		return s.sellerDTOFromModel(ctx, &ds), nil
	}

	if !s.echo.Configured() {
		if found {
			return s.sellerDTOFromModel(ctx, &ds), nil
		}
		return nil, nil
	}

	if found {
		goRefresh(ctx, "seller-detail", func(bg context.Context) {
			if _, err := s.refreshSellerDetail(bg, sellerID, region); err != nil {
				logger.Warn("店铺详情后台刷新失败", logger.String("sellerId", sellerID), logger.Err(err))
			}
		})
		return s.sellerDTOFromModel(ctx, &ds), nil
	}

	// 首见(DB 无):不阻塞——后台异步拉详情落库,本次返回空(下次即有)。读路径零同步 EchoTik。
	goRefresh(ctx, "seller-detail-first", func(bg context.Context) {
		if _, err := s.refreshSellerDetail(bg, sellerID, region); err != nil {
			logger.Warn("店铺详情首见后台拉取失败", logger.String("sellerId", sellerID), logger.Err(err))
		}
	})
	return nil, nil
}

// ── 达人详情入口 ──────────────────────────────────────────────────────────────

// InfluencerDetailFull 达人详情:读 DB 优先 + 按 detail_fetched_at 条件刷新。
//  1. DB 命中且详情新鲜(< influencerDetailTTL) → 零 API 直返;
//  2. EchoTik 未配置 → 有旧值返回旧值(降级),否则空;
//  3. 有旧值但陈旧 → stale-while-revalidate:先返回旧值,后台异步刷新(不随请求 ctx 取消);
//  4. 首见(无旧值) → 同步拉一次并落库。
//
// 趋势来自本地累计快照差分(见 influencerTrendFromSnapshots),不再实时打 EchoTik trend。
func (s *DiscoverService) InfluencerDetailFull(ctx context.Context, userID, region string) (*InfluencerDetailDTO, error) {
	var di model.DiscoverInfluencer
	found := false
	if s.db != nil {
		found = s.db.WithContext(ctx).
			Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, userID, region).
			First(&di).Error == nil
	}
	fresh := found && !di.DetailFetchedAt.IsZero() && time.Since(di.DetailFetchedAt) < detailTTLFor(di.IsTracked)
	if fresh {
		return s.influencerDTOFromModel(ctx, &di), nil
	}

	if !s.echo.Configured() {
		if found {
			return s.influencerDTOFromModel(ctx, &di), nil
		}
		return nil, nil
	}

	if found {
		goRefresh(ctx, "influencer-detail", func(bg context.Context) {
			if _, err := s.refreshInfluencerDetail(bg, userID, region); err != nil {
				logger.Warn("达人详情后台刷新失败", logger.String("userId", userID), logger.Err(err))
			}
		})
		return s.influencerDTOFromModel(ctx, &di), nil
	}

	// 首见(DB 无):不阻塞——后台异步拉详情落库,本次返回空(下次即有)。读路径零同步 EchoTik。
	goRefresh(ctx, "influencer-detail-first", func(bg context.Context) {
		if _, err := s.refreshInfluencerDetail(bg, userID, region); err != nil {
			logger.Warn("达人详情首见后台拉取失败", logger.String("userId", userID), logger.Err(err))
		}
	})
	return nil, nil
}

// ── 视频详情 DTO ──────────────────────────────────────────────────────────────

type VideoDetailDTO struct {
	VideoID      string             `json:"videoId"`
	UserID       string             `json:"userId"`
	UniqueID     string             `json:"uniqueId"`
	Region       string             `json:"region"`
	Desc         string             `json:"desc"`
	DescZh       string             `json:"descZh"` // 中文译文(空=尚未翻译,前端退回 desc)
	Cover        string             `json:"cover"`  // 已签名
	Avatar       string             `json:"avatar"` // 已签名
	Duration     int                `json:"duration"`
	CreateTime   string             `json:"createTime"`
	IsAd         bool               `json:"isAd"`
	CreatedByAI  bool               `json:"createdByAi"`
	Views        int                `json:"views"`
	Views7d      int                `json:"views7d"`
	Views30d     int                `json:"views30d"`
	Digg         int                `json:"digg"`
	Comments     int                `json:"comments"`
	Shares       int                `json:"shares"`
	Favorites    int                `json:"favorites"`
	SaleCnt      int                `json:"saleCnt"`
	SaleGmvCents int                `json:"saleGmvCents"`
	Products     []EntityProductDTO `json:"products"`
	VideoURL     string             `json:"videoUrl"` // COS 永久 mp4;空=未转存,前端回落 TikTok 外链
	Analysis     model.JSONB        `json:"analysis"` // AI 拆解结果 videoAnalysisOut;空=未拆解(marshal 成 null)
}

// VideoDetailFull 视频详情:读 DB 优先 + 按 detail_fetched_at 条件刷新(同 InfluencerDetailFull 四档)。
func (s *DiscoverService) VideoDetailFull(ctx context.Context, videoID, region string) (*VideoDetailDTO, error) {
	var dv model.DiscoverVideo
	found := false
	if s.db != nil {
		found = s.db.WithContext(ctx).
			Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, videoID, region).
			First(&dv).Error == nil
	}
	fresh := found && !dv.DetailFetchedAt.IsZero() && time.Since(dv.DetailFetchedAt) < detailTTLFor(dv.IsTracked)
	if fresh {
		return videoDTOFromModel(&dv), nil
	}

	if !s.echo.Configured() {
		if found {
			return videoDTOFromModel(&dv), nil
		}
		return nil, nil
	}

	if found {
		goRefresh(ctx, "video-detail", func(bg context.Context) {
			if _, err := s.refreshVideoDetail(bg, videoID, region); err != nil {
				logger.Warn("视频详情后台刷新失败", logger.String("videoId", videoID), logger.Err(err))
			}
		})
		return videoDTOFromModel(&dv), nil
	}

	// 首见(DB 无):不阻塞——后台异步拉详情落库,本次返回空(下次即有)。读路径零同步 EchoTik。
	goRefresh(ctx, "video-detail-first", func(bg context.Context) {
		if _, err := s.refreshVideoDetail(bg, videoID, region); err != nil {
			logger.Warn("视频详情首见后台拉取失败", logger.String("videoId", videoID), logger.Err(err))
		}
	})
	return nil, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

// parseIDList 解析 stringified JSON 数组(元素可能是数字或字符串)→ 字符串 ID 列表。
// 用 json.Number 避免大整数 ID 在 float64 下丢精度。
func parseIDList(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" {
		return nil
	}
	var arr []json.Number
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		// 兜底:尝试字符串数组。
		var sarr []string
		if json.Unmarshal([]byte(raw), &sarr) != nil {
			return nil
		}
		return sarr
	}
	out := make([]string, 0, len(arr))
	for _, n := range arr {
		if s := n.String(); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// firstCoverURL 兼容 cover_url 为 stringified JSON 数组([{url,index}])或单个 URL。
func firstCoverURL(raw string) string {
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(strings.TrimSpace(raw), "[") {
		if covers := echotik.ParseCovers(raw); len(covers) > 0 {
			return covers[0].URL
		}
		return ""
	}
	return raw // 单个 URL
}
