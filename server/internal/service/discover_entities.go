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
	DescZh               string  `json:"descZh"` // 中文译文(空=尚未翻译,前端退回 desc)
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
		return s.searchSellers(ctx, p)
	}
	// 任意类目/页都先读 DB:顺序表(按页)+ 主表,零 EchoTik。回填后类目/翻页也走本地。
	if res, ok := s.lookupSellerRanklist(ctx, p); ok {
		if res.FetchedAt != nil {
			s.maybeRefreshEntityRanklist(ctx, "seller", p, *res.FetchedAt) // 陈旧则 SWR 后台刷
		}
		return res
	}
	// 未本地化的页:拉 live(顺手按页落库供下次)。
	return s.fetchSellerRanklistLive(ctx, p)
}

// hostMapSellers 封面转存 COS + 映射 DTO(榜单 / 搜索共用)。
func (s *DiscoverService) hostMapSellers(ctx context.Context, raw []echotik.SellerListItem) []SellerDTO {
	imgs := make([]string, 0, len(raw))
	for _, it := range raw {
		imgs = append(imgs, it.CoverURL)
	}
	hosted := s.hostCoversAsync(ctx, imgs)
	rows := make([]SellerDTO, 0, len(raw))
	for _, it := range raw {
		rows = append(rows, mapSeller(it, hosted))
	}
	return rows
}

// InfluencerRanklist 达人榜(缓存优先);带关键词时走搜索(不缓存)。
func (s *DiscoverService) InfluencerRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[InfluencerDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return s.searchInfluencers(ctx, p)
	}
	if res, ok := s.lookupInfluencerRanklist(ctx, p); ok {
		if res.FetchedAt != nil {
			s.maybeRefreshEntityRanklist(ctx, "influencer", p, *res.FetchedAt) // 陈旧则 SWR 后台刷
		}
		return res
	}
	return s.fetchInfluencerRanklistLive(ctx, p)
}

// hostMapInfluencers 头像转存 COS + 映射 DTO(榜单 / 搜索共用)。
func (s *DiscoverService) hostMapInfluencers(ctx context.Context, raw []echotik.InfluencerListItem) []InfluencerDTO {
	imgs := make([]string, 0, len(raw))
	for _, it := range raw {
		imgs = append(imgs, it.Avatar)
	}
	hosted := s.hostCoversAsync(ctx, imgs)
	rows := make([]InfluencerDTO, 0, len(raw))
	for _, it := range raw {
		rows = append(rows, mapInfluencer(it, hosted))
	}
	return rows
}

// VideoRanklist 带货视频榜(缓存优先);带关键词时走搜索(不缓存)。
func (s *DiscoverService) VideoRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[VideoDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if p.Keyword != "" {
		return s.searchVideos(ctx, p)
	}
	if res, ok := s.lookupVideoRanklist(ctx, p); ok {
		if res.FetchedAt != nil {
			s.maybeRefreshEntityRanklist(ctx, "video", p, *res.FetchedAt) // 陈旧则 SWR 后台刷
		}
		return res
	}
	return s.fetchVideoRanklistLive(ctx, p)
}

// hostMapVideos 封面/头像转存 COS + 映射 DTO(榜单 / 搜索共用)。
func (s *DiscoverService) hostMapVideos(ctx context.Context, raw []echotik.VideoListItem) []VideoDTO {
	imgs := make([]string, 0, len(raw)*2)
	for _, it := range raw {
		imgs = append(imgs, it.ReflowCover, it.Avatar)
	}
	hosted := s.hostCoversAsync(ctx, imgs)
	rows := make([]VideoDTO, 0, len(raw))
	for _, it := range raw {
		rows = append(rows, mapVideo(it, hosted))
	}
	return rows
}

// PrewarmEntities 供定时任务预热店铺/达人/视频三榜:强制拉取并回写缓存(绕过读缓存,
// 确保 TTL 过期前主动刷新)。p.PageSize 必须与前端一致(20),否则缓存键含 page_size
// 不匹配、预热失效。RankField 在此按榜单固定(店铺=热销/达人=带货/视频=带货),
// 与 handler 各榜默认一致——combo 的 RankField 只描述商品榜,三榜 field 语义各异不可共用。
// 三榜独立尝试,单榜失败不影响其他;返回首个错误供调用方记日志。
func (s *DiscoverService) PrewarmEntities(ctx context.Context, p echotik.RanklistParams) error {
	if !s.echo.Configured() {
		return nil
	}
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	p.PageNum = 1 // 预热第 1 页,与前端默认页缓存键对齐
	var firstErr error
	sp := p
	sp.RankField = echotik.SellerFieldSales
	if raw, err := s.echo.GetSellerRanklist(ctx, sp); err != nil {
		firstErr = err
	} else if len(raw) > 0 {
		s.upsertSellerList(ctx, sp.Region, raw) // 落主表(含 COS 封面)+ 当日快照
		s.writeEntityRanklist(ctx, "seller", sp, sellerIDsOf(raw))
	}
	ip := p
	ip.RankField = echotik.InfluencerFieldSales
	if raw, err := s.echo.GetInfluencerRanklist(ctx, ip); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	} else if len(raw) > 0 {
		s.upsertInfluencerList(ctx, ip.Region, raw)
		s.writeEntityRanklist(ctx, "influencer", ip, influencerIDsOf(raw))
	}
	vp := p
	vp.RankField = echotik.VideoFieldSales
	if raw, err := s.echo.GetVideoRanklist(ctx, vp); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	} else if len(raw) > 0 {
		s.upsertVideoList(ctx, vp.Region, raw)
		s.writeEntityRanklist(ctx, "video", vp, videoIDsOf(raw))
	}
	return firstErr
}

func mapSeller(it echotik.SellerListItem, signed map[string]string) SellerDTO {
	return SellerDTO{
		SellerID:        it.SellerID,
		SellerName:      it.SellerName,
		Region:          it.Region,
		CoverURL:        hostedURL(it.CoverURL, signed),
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
		AvatarURL:         hostedURL(it.Avatar, signed),
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
		CoverURL:             hostedURL(it.ReflowCover, signed),
		AvatarURL:            hostedURL(it.Avatar, signed),
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

// hostedURL 把原始防盗链 URL 换成转存后的可用 URL;缺失(mock / 非 TOS host / 转存失败)返回 nil → 前端走占位图。
// 注:四榜(商品/店铺/达人/视频)封面统一走 COS 永久化(rehostCovers),失败自动回退 3 天签名 URL。
func hostedURL(raw string, hosted map[string]string) *string {
	if raw == "" || hosted == nil {
		return nil
	}
	if dst, ok := hosted[raw]; ok && dst != "" {
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
