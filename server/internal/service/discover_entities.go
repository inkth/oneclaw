package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/faxianmao/server/internal/service/echotik"
)

// 店铺/达人/视频三榜:不落库、不导入、不收藏,只「取数 → 签图 → 映射 DTO」。
// 与商品榜共用 EchoTik 客户端,未配置凭证时返回空态。

// EntityRanklistResult 三榜统一返回信封。state: cached | empty。
type EntityRanklistResult[T any] struct {
	State     string     `json:"state"`
	FetchedAt *time.Time `json:"fetchedAt,omitempty"`
	Warming   bool       `json:"warming,omitempty"` // 当前返回为空/部分,已触发后台异步补全
	Rows      []T        `json:"rows"`
}

type SellerDTO struct {
	SellerID   string   `json:"sellerId"`
	SellerName string   `json:"sellerName"`
	Region     string   `json:"region"`
	CoverURL   *string  `json:"coverUrl"`
	Rating     float64  `json:"rating"`
	Categories []string `json:"categories"`
	// 近 7 天窗口 + 迷你趋势(详情回填/快照差分;0/空 = 详情尚未回填,前端画 —)
	Sale7dCnt int     `json:"sale7dCnt"`
	Gmv7dAmt  float64 `json:"gmv7dAmt"`
	Spark7d   []int   `json:"spark7d"`
	// 累计权威值(seller/detail 口径)。榜单行原生的 total_* 是「榜单周期增量」,不透出。
	TotalSaleCnt    int     `json:"totalSaleCnt"`
	TotalSaleGmvAmt float64 `json:"totalSaleGmvAmt"`
	TotalIflCnt     int     `json:"totalIflCnt"`
	CrawlProductCnt int     `json:"crawlProductCnt"` // 在售商品数
}

type InfluencerDTO struct {
	UserID            string  `json:"userId"`
	UniqueID          string  `json:"uniqueId"`
	NickName          string  `json:"nickName"`
	Region            string  `json:"region"`
	AvatarURL         *string `json:"avatarUrl"`
	Category          string  `json:"category"`
	EcScore           float64 `json:"ecScore"`
	TotalFollowersCnt int     `json:"totalFollowersCnt"`
	TotalDiggCnt      int     `json:"totalDiggCnt"`
	TotalProductCnt   int     `json:"totalProductCnt"`
	TotalPostVideoCnt int     `json:"totalPostVideoCnt"`
	TotalLiveCnt      int     `json:"totalLiveCnt"`
	TotalSaleCnt      int     `json:"totalSaleCnt"`
	TotalSaleGmvAmt   float64 `json:"totalSaleGmvAmt"`
}

type VideoDTO struct {
	VideoID              string  `json:"videoId"`
	NickName             string  `json:"nickName"`
	UniqueID             string  `json:"uniqueId"`
	Region               string  `json:"region"`
	CoverURL             *string `json:"coverUrl"`
	AvatarURL            *string `json:"avatarUrl"`
	Desc                 string  `json:"desc"`
	Category             string  `json:"category"`
	Duration             int     `json:"duration"`
	CreateTime           string  `json:"createTime"`
	TotalViewsCnt        int     `json:"totalViewsCnt"`
	TotalDiggCnt         int     `json:"totalDiggCnt"`
	TotalCommentsCnt     int     `json:"totalCommentsCnt"`
	TotalSharesCnt       int     `json:"totalSharesCnt"`
	TotalVideoSaleCnt    int     `json:"totalVideoSaleCnt"`
	TotalVideoSaleGmvAmt float64 `json:"totalVideoSaleGmvAmt"`
}

// SellerRanklist 店铺榜:读路径**零同步 EchoTik**。所有维度(任意类目/页)先查 DB 顺序表+主表,
// 按页切片;miss/陈旧/超出深度 → goRefresh 后台拉取落库,当前按库存返回(可能空+warming)。
func (s *DiscoverService) SellerRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[SellerDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return s.searchSellers(ctx, p)
	}
	if res, ok := s.lookupSellerRanklist(ctx, p); ok {
		s.warmEntityIfNeeded(ctx, "seller", p, res.FetchedAt, len(res.Rows))
		return res
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[SellerDTO]{State: "empty", Rows: []SellerDTO{}}
	}
	s.warmEntityRanklist(ctx, "seller", p, defaultRanklistDepth)
	return &EntityRanklistResult[SellerDTO]{State: "cached", Warming: true, Rows: []SellerDTO{}}
}

// InfluencerRanklist 达人榜:读路径**零同步 EchoTik**(同 SellerRanklist)。
func (s *DiscoverService) InfluencerRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[InfluencerDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return s.searchInfluencers(ctx, p)
	}
	if res, ok := s.lookupInfluencerRanklist(ctx, p); ok {
		s.warmEntityIfNeeded(ctx, "influencer", p, res.FetchedAt, len(res.Rows))
		return res
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[InfluencerDTO]{State: "empty", Rows: []InfluencerDTO{}}
	}
	s.warmEntityRanklist(ctx, "influencer", p, defaultRanklistDepth)
	return &EntityRanklistResult[InfluencerDTO]{State: "cached", Warming: true, Rows: []InfluencerDTO{}}
}

// signMapInfluencers 签头像 + 映射 DTO(榜单 / 搜索共用)。
func (s *DiscoverService) signMapInfluencers(ctx context.Context, raw []echotik.InfluencerListItem) []InfluencerDTO {
	imgs := make([]string, 0, len(raw))
	for _, it := range raw {
		imgs = append(imgs, it.Avatar)
	}
	signed := s.echo.SignCovers(ctx, imgs)
	rows := make([]InfluencerDTO, 0, len(raw))
	for _, it := range raw {
		rows = append(rows, mapInfluencer(it, signed))
	}
	return rows
}

// VideoRanklist 带货视频榜:读路径**零同步 EchoTik**(同 SellerRanklist)。
func (s *DiscoverService) VideoRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[VideoDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return s.searchVideos(ctx, p)
	}
	if res, ok := s.lookupVideoRanklist(ctx, p); ok {
		s.warmEntityIfNeeded(ctx, "video", p, res.FetchedAt, len(res.Rows))
		return res
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[VideoDTO]{State: "empty", Rows: []VideoDTO{}}
	}
	s.warmEntityRanklist(ctx, "video", p, defaultRanklistDepth)
	return &EntityRanklistResult[VideoDTO]{State: "cached", Warming: true, Rows: []VideoDTO{}}
}

// signMapVideos 签封面/头像 + 映射 DTO(榜单 / 搜索共用)。
func (s *DiscoverService) signMapVideos(ctx context.Context, raw []echotik.VideoListItem) []VideoDTO {
	imgs := make([]string, 0, len(raw)*2)
	for _, it := range raw {
		imgs = append(imgs, it.ReflowCover, it.Avatar)
	}
	signed := s.echo.SignCovers(ctx, imgs)
	rows := make([]VideoDTO, 0, len(raw))
	for _, it := range raw {
		rows = append(rows, mapVideo(it, signed))
	}
	return rows
}

// PrewarmEntities 供定时任务/回填预热实体榜:强制拉取前 pages 页并累积落库
// (主表 + 顺序表)。p.PageSize 必须与前端一致(20),否则顺序表键含 page_size 不匹配、预热失效。
// kinds 不传=三榜全预热;各榜独立尝试,单榜失败不影响其他;返回首个错误供调用方记日志。
func (s *DiscoverService) PrewarmEntities(ctx context.Context, p echotik.RanklistParams, pages int, kinds ...string) error {
	if !s.echo.Configured() {
		return nil
	}
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if pages < 1 {
		pages = 1
	}
	if len(kinds) == 0 {
		kinds = []string{"seller", "influencer", "video"}
	}
	var firstErr error
	for _, kind := range kinds {
		if err := s.prewarmEntityKind(ctx, kind, p, pages); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func mapInfluencer(it echotik.InfluencerListItem, signed map[string]string) InfluencerDTO {
	return InfluencerDTO{
		UserID:            it.UserID,
		UniqueID:          it.UniqueID,
		NickName:          it.NickName,
		Region:            it.Region,
		AvatarURL:         signedURL(it.Avatar, signed),
		Category:          it.Category,
		EcScore:           it.EcScore,
		TotalFollowersCnt: it.TotalFollowersCnt,
		TotalDiggCnt:      it.TotalDiggCnt,
		TotalProductCnt:   it.TotalProductCnt,
		TotalPostVideoCnt: it.TotalPostVideoCnt,
		TotalLiveCnt:      it.TotalLiveCnt,
		TotalSaleCnt:      it.TotalSaleCnt,
		TotalSaleGmvAmt:   it.TotalSaleGmvAmt,
	}
}

func mapVideo(it echotik.VideoListItem, signed map[string]string) VideoDTO {
	return VideoDTO{
		VideoID:              it.VideoID,
		NickName:             it.NickName,
		UniqueID:             it.UniqueID,
		Region:               it.Region,
		CoverURL:             signedURL(it.ReflowCover, signed),
		AvatarURL:            signedURL(it.Avatar, signed),
		Desc:                 it.VideoDesc,
		Category:             it.Category,
		Duration:             it.Duration,
		CreateTime:           string(it.CreateTime),
		TotalViewsCnt:        it.TotalViewsCnt,
		TotalDiggCnt:         it.TotalDiggCnt,
		TotalCommentsCnt:     it.TotalCommentsCnt,
		TotalSharesCnt:       it.TotalSharesCnt,
		TotalVideoSaleCnt:    it.TotalVideoSaleCnt,
		TotalVideoSaleGmvAmt: it.TotalVideoSaleGmvAmt,
	}
}

// signedURL 把原始防盗链 URL 换成签名后的;签名缺失(非 TOS host)返回 nil → 前端走占位图。
// 注:店铺/达人/视频三榜走签名 URL(3 天有效,前端 onError 兜底);仅商品榜走 COS 永久化(rehostCovers)。
func signedURL(raw string, signed map[string]string) *string {
	if raw == "" || signed == nil {
		return nil
	}
	if dst, ok := signed[raw]; ok && dst != "" {
		return &dst
	}
	return nil
}

// parseCategoryNames 解析 EchoTik 把主营类目塞成的 stringified JSON: [{category_name,...}]。
func parseCategoryNames(raw string, n int) []string {
	out := []string{}
	if raw == "" {
		return out
	}
	var arr []struct {
		CategoryName string `json:"category_name"`
	}
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return out
	}
	for _, x := range arr {
		if x.CategoryName == "" {
			continue
		}
		out = append(out, x.CategoryName)
		if len(out) >= n {
			break
		}
	}
	return out
}
