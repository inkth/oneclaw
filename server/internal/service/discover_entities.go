package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/oneclaw/server/internal/service/echotik"
)

// 店铺/达人/视频三榜:不落库、不导入、不收藏,只「取数 → 签图 → 映射 DTO」。
// 与商品榜共用 EchoTik 客户端,未配置凭证时降级到 mock。

// EntityRanklistResult 三榜统一返回信封。state: live | mock | error | empty。
type EntityRanklistResult[T any] struct {
	State     string     `json:"state"`
	FetchedAt *time.Time `json:"fetchedAt,omitempty"`
	Rows      []T        `json:"rows"`
}

type SellerDTO struct {
	SellerID        string   `json:"sellerId"`
	SellerName      string   `json:"sellerName"`
	Region          string   `json:"region"`
	CoverURL        *string  `json:"coverUrl"`
	Rating          float64  `json:"rating"`
	Categories      []string `json:"categories"`
	TotalProductCnt int      `json:"totalProductCnt"`
	TotalSaleCnt    int      `json:"totalSaleCnt"`
	TotalSaleGmvAmt float64  `json:"totalSaleGmvAmt"`
	TotalIflCnt     int      `json:"totalIflCnt"`
	TotalVideoCnt   int      `json:"totalVideoCnt"`
	TotalLiveCnt    int      `json:"totalLiveCnt"`
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

// SellerRanklist 店铺榜(缓存优先);带关键词时走搜索(不缓存)。
func (s *DiscoverService) SellerRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[SellerDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return entitySearch(s.echo.Configured(),
			func() []SellerDTO { return s.signMapSellers(ctx, echotik.MockSearchSellers(p.Region, p.Keyword, p.PageSize)) },
			func() ([]SellerDTO, error) {
				raw, err := s.echo.SearchSellers(ctx, p.Keyword, p.Region, p.PageSize)
				if err != nil {
					return nil, err
				}
				// 搜索响应店铺无 region 字段(只回 priority_region/seller_location),回填查询 region。
				for i := range raw {
					if raw[i].Region == "" {
						raw[i].Region = p.Region
					}
				}
				return s.signMapSellers(ctx, raw), nil
			},
		)
	}
	return cachedEntity(s, ctx, entityCacheKey("seller", p), s.echo.Configured(),
		func() []SellerDTO { return s.signMapSellers(ctx, echotik.MockSellers(p.Region, p.PageSize)) },
		func() ([]SellerDTO, error) { return s.fetchSellerRows(ctx, p) },
	)
}

// fetchSellerRows 拉店铺榜 → 签封面 → 映射 DTO。缓存 live 路径与定时预热共用。
func (s *DiscoverService) fetchSellerRows(ctx context.Context, p echotik.RanklistParams) ([]SellerDTO, error) {
	raw, err := s.echo.GetSellerRanklist(ctx, p)
	if err != nil {
		return nil, err
	}
	return s.signMapSellers(ctx, raw), nil
}

// signMapSellers 签封面 + 映射 DTO(榜单 / 搜索共用)。
func (s *DiscoverService) signMapSellers(ctx context.Context, raw []echotik.SellerListItem) []SellerDTO {
	imgs := make([]string, 0, len(raw))
	for _, it := range raw {
		imgs = append(imgs, it.CoverURL)
	}
	signed := s.echo.SignCovers(ctx, imgs)
	rows := make([]SellerDTO, 0, len(raw))
	for _, it := range raw {
		rows = append(rows, mapSeller(it, signed))
	}
	return rows
}

// InfluencerRanklist 达人榜(缓存优先);带关键词时走搜索(不缓存)。
func (s *DiscoverService) InfluencerRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[InfluencerDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return entitySearch(s.echo.Configured(),
			func() []InfluencerDTO { return s.signMapInfluencers(ctx, echotik.MockSearchInfluencers(p.Region, p.Keyword, p.PageSize)) },
			func() ([]InfluencerDTO, error) {
				raw, err := s.echo.SearchInfluencers(ctx, p.Keyword, p.Region, p.PageSize)
				if err != nil {
					return nil, err
				}
				return s.signMapInfluencers(ctx, raw), nil
			},
		)
	}
	return cachedEntity(s, ctx, entityCacheKey("influencer", p), s.echo.Configured(),
		func() []InfluencerDTO { return s.signMapInfluencers(ctx, echotik.MockInfluencers(p.Region, p.PageSize)) },
		func() ([]InfluencerDTO, error) { return s.fetchInfluencerRows(ctx, p) },
	)
}

// fetchInfluencerRows 拉达人榜 → 签头像 → 映射 DTO。缓存 live 路径与定时预热共用。
func (s *DiscoverService) fetchInfluencerRows(ctx context.Context, p echotik.RanklistParams) ([]InfluencerDTO, error) {
	raw, err := s.echo.GetInfluencerRanklist(ctx, p)
	if err != nil {
		return nil, err
	}
	return s.signMapInfluencers(ctx, raw), nil
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

// VideoRanklist 带货视频榜(缓存优先);带关键词时走搜索(不缓存)。
func (s *DiscoverService) VideoRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[VideoDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return entitySearch(s.echo.Configured(),
			func() []VideoDTO { return s.signMapVideos(ctx, echotik.MockSearchVideos(p.Region, p.Keyword, p.PageSize)) },
			func() ([]VideoDTO, error) {
				raw, err := s.echo.SearchVideos(ctx, p.Keyword, p.Region, p.PageSize)
				if err != nil {
					return nil, err
				}
				return s.signMapVideos(ctx, raw), nil
			},
		)
	}
	return cachedEntity(s, ctx, entityCacheKey("video", p), s.echo.Configured(),
		func() []VideoDTO { return s.signMapVideos(ctx, echotik.MockVideos(p.Region, p.PageSize)) },
		func() ([]VideoDTO, error) { return s.fetchVideoRows(ctx, p) },
	)
}

// fetchVideoRows 拉视频榜 → 签封面/头像 → 映射 DTO。缓存 live 路径与定时预热共用。
func (s *DiscoverService) fetchVideoRows(ctx context.Context, p echotik.RanklistParams) ([]VideoDTO, error) {
	raw, err := s.echo.GetVideoRanklist(ctx, p)
	if err != nil {
		return nil, err
	}
	return s.signMapVideos(ctx, raw), nil
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

// PrewarmEntities 供定时任务预热店铺/达人/视频三榜:强制拉取并回写缓存(绕过读缓存,
// 确保 TTL 过期前主动刷新)。p.PageSize 必须与前端一致(20),否则缓存键含 page_size
// 不匹配、预热失效。三榜独立尝试,单榜失败不影响其他;返回首个错误供调用方记日志。
func (s *DiscoverService) PrewarmEntities(ctx context.Context, p echotik.RanklistParams) error {
	if !s.echo.Configured() {
		return nil
	}
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	p.PageNum = 1 // 预热第 1 页,与前端默认页缓存键对齐
	var firstErr error
	if rows, err := s.fetchSellerRows(ctx, p); err != nil {
		firstErr = err
	} else if len(rows) > 0 {
		s.cacheSetJSON(ctx, entityCacheKey("seller", p), rows)
	}
	if rows, err := s.fetchInfluencerRows(ctx, p); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	} else if len(rows) > 0 {
		s.cacheSetJSON(ctx, entityCacheKey("influencer", p), rows)
	}
	if rows, err := s.fetchVideoRows(ctx, p); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	} else if len(rows) > 0 {
		s.cacheSetJSON(ctx, entityCacheKey("video", p), rows)
	}
	return firstErr
}

func mapSeller(it echotik.SellerListItem, signed map[string]string) SellerDTO {
	return SellerDTO{
		SellerID:        it.SellerID,
		SellerName:      it.SellerName,
		Region:          it.Region,
		CoverURL:        signedURL(it.CoverURL, signed),
		Rating:          it.Rating.Float(),
		Categories:      parseCategoryNames(it.MostProductCategoryList, 2),
		TotalProductCnt: it.TotalProductCnt,
		TotalSaleCnt:    it.TotalSaleCnt,
		TotalSaleGmvAmt: it.TotalSaleGmvAmt,
		TotalIflCnt:     it.TotalIflCnt,
		TotalVideoCnt:   it.TotalVideoCnt,
		TotalLiveCnt:    it.TotalLiveCnt,
	}
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

// signedURL 把原始防盗链 URL 换成签名后的;签名缺失(mock / 非 TOS host)返回 nil → 前端走占位图。
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
