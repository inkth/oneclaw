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

// SellerRanklist 店铺榜。
func (s *DiscoverService) SellerRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[SellerDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	res := &EntityRanklistResult[SellerDTO]{Rows: []SellerDTO{}}

	if !s.echo.Configured() {
		res.State = "mock"
		for _, it := range echotik.MockSellers(p.Region, p.PageSize) {
			res.Rows = append(res.Rows, mapSeller(it, nil))
		}
		return res
	}

	raw, err := s.echo.GetSellerRanklist(ctx, p)
	if err != nil {
		res.State = "error"
		for _, it := range echotik.MockSellers(p.Region, p.PageSize) {
			res.Rows = append(res.Rows, mapSeller(it, nil))
		}
		return res
	}

	imgs := make([]string, 0, len(raw))
	for _, it := range raw {
		imgs = append(imgs, it.CoverURL)
	}
	signed := s.echo.SignCovers(ctx, imgs)
	for _, it := range raw {
		res.Rows = append(res.Rows, mapSeller(it, signed))
	}
	if len(res.Rows) == 0 {
		res.State = "empty"
		return res
	}
	now := time.Now()
	res.State = "live"
	res.FetchedAt = &now
	return res
}

// InfluencerRanklist 达人榜。
func (s *DiscoverService) InfluencerRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[InfluencerDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	res := &EntityRanklistResult[InfluencerDTO]{Rows: []InfluencerDTO{}}

	if !s.echo.Configured() {
		res.State = "mock"
		for _, it := range echotik.MockInfluencers(p.Region, p.PageSize) {
			res.Rows = append(res.Rows, mapInfluencer(it, nil))
		}
		return res
	}

	raw, err := s.echo.GetInfluencerRanklist(ctx, p)
	if err != nil {
		res.State = "error"
		for _, it := range echotik.MockInfluencers(p.Region, p.PageSize) {
			res.Rows = append(res.Rows, mapInfluencer(it, nil))
		}
		return res
	}

	imgs := make([]string, 0, len(raw))
	for _, it := range raw {
		imgs = append(imgs, it.Avatar)
	}
	signed := s.echo.SignCovers(ctx, imgs)
	for _, it := range raw {
		res.Rows = append(res.Rows, mapInfluencer(it, signed))
	}
	if len(res.Rows) == 0 {
		res.State = "empty"
		return res
	}
	now := time.Now()
	res.State = "live"
	res.FetchedAt = &now
	return res
}

// VideoRanklist 带货视频榜。
func (s *DiscoverService) VideoRanklist(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[VideoDTO] {
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	res := &EntityRanklistResult[VideoDTO]{Rows: []VideoDTO{}}

	if !s.echo.Configured() {
		res.State = "mock"
		for _, it := range echotik.MockVideos(p.Region, p.PageSize) {
			res.Rows = append(res.Rows, mapVideo(it, nil))
		}
		return res
	}

	raw, err := s.echo.GetVideoRanklist(ctx, p)
	if err != nil {
		res.State = "error"
		for _, it := range echotik.MockVideos(p.Region, p.PageSize) {
			res.Rows = append(res.Rows, mapVideo(it, nil))
		}
		return res
	}

	imgs := make([]string, 0, len(raw)*2)
	for _, it := range raw {
		imgs = append(imgs, it.ReflowCover, it.Avatar)
	}
	signed := s.echo.SignCovers(ctx, imgs)
	for _, it := range raw {
		res.Rows = append(res.Rows, mapVideo(it, signed))
	}
	if len(res.Rows) == 0 {
		res.State = "empty"
		return res
	}
	now := time.Now()
	res.State = "live"
	res.FetchedAt = &now
	return res
}

func mapSeller(it echotik.SellerListItem, signed map[string]string) SellerDTO {
	return SellerDTO{
		SellerID:        it.SellerID,
		SellerName:      it.SellerName,
		Region:          it.Region,
		CoverURL:        signedURL(it.CoverURL, signed),
		Rating:          it.Rating,
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
