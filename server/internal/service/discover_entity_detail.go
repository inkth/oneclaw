package service

import (
	"context"
	"encoding/json"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/oneclaw/server/internal/service/echotik"
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

func (s *DiscoverService) SellerDetailFull(ctx context.Context, sellerID, region string) (*SellerDetailDTO, error) {
	if !s.echo.Configured() {
		return nil, nil
	}
	key := "sdetail:" + region + ":" + sellerID
	var cached SellerDetailDTO
	if _, ok := s.cacheGetJSON(ctx, key, entityCacheTTL, &cached); ok {
		return &cached, nil
	}

	d, err := s.echo.GetSellerDetail(ctx, sellerID, region)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}

	var (
		products []echotik.EntityProduct
		trend    []echotik.SellerTrendPoint
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		products, _ = s.echo.GetSellerProducts(gctx, sellerID, region, 10)
		return nil
	})
	g.Go(func() error {
		trend, _ = s.echo.GetSellerTrend(gctx, sellerID, region, 14)
		return nil
	})
	_ = g.Wait()

	// 收集需签名的图:店铺封面 + 各商品首图。
	toSign := []string{d.CoverURL}
	prodRaw := make([]string, len(products))
	for i, pr := range products {
		prodRaw[i] = firstCoverURL(pr.CoverURL)
		toSign = append(toSign, prodRaw[i])
	}
	signed := s.echo.SignCovers(ctx, toSign)
	sign := func(raw string) string {
		if raw == "" {
			return ""
		}
		if su, ok := signed[raw]; ok {
			return su
		}
		return raw // 非防盗链域名(如已是普通 URL)直接用
	}

	dto := &SellerDetailDTO{
		SellerID:          d.SellerID,
		SellerName:        d.SellerName,
		Region:            d.Region,
		Cover:             sign(d.CoverURL),
		SellerLink:        d.SellerLink,
		Rating:            d.Rating.Float(),
		Categories:        parseCategoryNames(d.MostProductCategoryList, 5),
		AvgPriceCents:     echotik.DollarsToCents(d.SpuAvgPrice.Float()),
		TotalProductCnt:   d.TotalProductCnt.Int(),
		TotalSaleCnt:      d.TotalSaleCnt.Int(),
		TotalSaleGmvCents: echotik.DollarsToCents(d.TotalSaleGmvAmt.Float()),
		TotalIflCnt:       d.TotalIflCnt.Int(),
		TotalVideoCnt:     d.TotalVideoCnt.Int(),
		TotalLiveCnt:      d.TotalLiveCnt.Int(),
		Windows: &EntityWindowsDTO{
			Sale7dCnt:   d.TotalSale7dCnt.Int(),
			Sale30dCnt:  d.TotalSale30dCnt.Int(),
			Gmv7dCents:  echotik.DollarsToCents(d.TotalSaleGmv7dAmt.Float()),
			Gmv30dCents: echotik.DollarsToCents(d.TotalSaleGmv30dAmt.Float()),
		},
		Products: make([]EntityProductDTO, 0, len(products)),
		Trend:    make([]TrendPointDTO, 0, len(trend)),
	}
	for i, pr := range products {
		dto.Products = append(dto.Products, EntityProductDTO{
			ProductID:      pr.ProductID,
			Name:           pr.ProductName,
			Cover:          sign(prodRaw[i]),
			AvgPriceCents:  echotik.DollarsToCents(pr.MaxPrice.Float()),
			CommissionRate: pr.ProductCommissionRate.Float(),
			Rating:         pr.ProductRating.Float(),
		})
	}
	for _, t := range trend {
		dto.Trend = append(dto.Trend, TrendPointDTO{
			Dt: t.Dt, SaleCnt: t.Sale1dCnt.Int(), GmvCents: echotik.DollarsToCents(t.SaleGmv1dAmt.Float()),
		})
	}
	s.cacheSetJSON(ctx, key, dto)
	return dto, nil
}

// ── 达人详情入口 ──────────────────────────────────────────────────────────────

func (s *DiscoverService) InfluencerDetailFull(ctx context.Context, userID, region string) (*InfluencerDetailDTO, error) {
	if !s.echo.Configured() {
		return nil, nil
	}
	key := "idetail:" + region + ":" + userID
	var cached InfluencerDetailDTO
	if _, ok := s.cacheGetJSON(ctx, key, entityCacheTTL, &cached); ok {
		return &cached, nil
	}

	d, err := s.echo.GetInfluencerDetail(ctx, userID, region)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}

	var (
		videos []echotik.InfluencerVideo
		trend  []echotik.InfluencerTrendPoint
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		videos, _ = s.echo.GetInfluencerVideos(gctx, userID, region, 10)
		return nil
	})
	g.Go(func() error {
		trend, _ = s.echo.GetInfluencerTrend(gctx, userID, region, 14)
		return nil
	})
	_ = g.Wait()

	toSign := []string{d.Avatar}
	vidRaw := make([]string, len(videos))
	for i, v := range videos {
		vidRaw[i] = v.ReflowCover
		toSign = append(toSign, v.ReflowCover)
	}
	signed := s.echo.SignCovers(ctx, toSign)
	sign := func(raw string) string {
		if su, ok := signed[raw]; ok {
			return su
		}
		return raw
	}

	dto := &InfluencerDetailDTO{
		UserID:            d.UserID,
		UniqueID:          d.UniqueID,
		NickName:          d.NickName,
		Region:            d.Region,
		Avatar:            sign(d.Avatar),
		Category:          d.Category,
		Gender:            d.Gender,
		Language:          d.Language,
		ContactEmail:      d.ContactEmail,
		Signature:         d.Signature,
		EcScore:           d.EcScore.Float(),
		InteractionRate:   d.InteractionRate.Float(),
		Followers:         d.TotalFollowersCnt.Int(),
		Followers30d:      d.TotalFollowers30dCnt.Int(),
		PostVideoCnt:      d.TotalPostVideoCnt.Int(),
		ProductCnt:        d.TotalProductCnt.Int(),
		TotalSaleCnt:      d.TotalSaleCnt.Int(),
		TotalSaleGmvCents: echotik.DollarsToCents(d.TotalSaleGmvAmt.Float()),
		TotalViewsCnt:     d.TotalViewsCnt.Int(),
		TotalDiggCnt:      d.TotalDiggCnt.Int(),
		Videos:            make([]InfluencerVideoDTO, 0, len(videos)),
		Trend:             make([]InfluencerTrendDTO, 0, len(trend)),
	}
	for i, v := range videos {
		dto.Videos = append(dto.Videos, InfluencerVideoDTO{
			VideoID:      v.VideoID,
			UniqueID:     v.UniqueID,
			Cover:        sign(vidRaw[i]),
			Desc:         v.VideoDesc,
			IsAd:         v.IsAd.Int() == 1,
			Views:        v.TotalViewsCnt.Int(),
			Digg:         v.TotalDiggCnt.Int(),
			Comments:     v.TotalCommentsCnt.Int(),
			Shares:       v.TotalSharesCnt.Int(),
			CreateTime:   string(v.CreateTime),
			SaleCnt:      v.TotalVideoSaleCnt.Int(),
			SaleGmvCents: echotik.DollarsToCents(v.TotalVideoSaleGmv.Float()),
		})
	}
	for _, t := range trend {
		dto.Trend = append(dto.Trend, InfluencerTrendDTO{
			Dt:           t.Dt,
			Followers:    t.TotalFollowersCnt.Int(),
			NewFollowers: t.Followers1dCnt.Int(),
			SaleCnt:      t.Sale1dCnt.Int(),
			GmvCents:     echotik.DollarsToCents(t.SaleGmv1dAmt.Float()),
		})
	}
	s.cacheSetJSON(ctx, key, dto)
	return dto, nil
}

// ── 视频详情 DTO ──────────────────────────────────────────────────────────────

type VideoDetailDTO struct {
	VideoID      string             `json:"videoId"`
	UserID       string             `json:"userId"`
	UniqueID     string             `json:"uniqueId"`
	Region       string             `json:"region"`
	Desc         string             `json:"desc"`
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
}

func (s *DiscoverService) VideoDetailFull(ctx context.Context, videoID, region string) (*VideoDetailDTO, error) {
	if !s.echo.Configured() {
		return nil, nil
	}
	key := "vdetail:" + region + ":" + videoID
	var cached VideoDetailDTO
	if _, ok := s.cacheGetJSON(ctx, key, entityCacheTTL, &cached); ok {
		return &cached, nil
	}

	d, err := s.echo.GetVideoDetail(ctx, videoID, region)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}

	// 视频带货商品(video_products 是 productId 数组)→ 取详情补名称/封面/价格。
	pids := parseIDList(d.VideoProducts)
	var prods []echotik.ProductDetail
	if len(pids) > 0 {
		prods, _ = s.echo.GetProductDetails(ctx, pids, region)
	}

	toSign := []string{d.ReflowCover, d.Avatar}
	prodRaw := make([]string, len(prods))
	for i, pr := range prods {
		prodRaw[i] = firstCoverURL(pr.CoverURL)
		toSign = append(toSign, prodRaw[i])
	}
	signed := s.echo.SignCovers(ctx, toSign)
	sign := func(raw string) string {
		if raw == "" {
			return ""
		}
		if su, ok := signed[raw]; ok {
			return su
		}
		return raw
	}

	dto := &VideoDetailDTO{
		VideoID:      d.VideoID,
		UserID:       d.UserID,
		UniqueID:     d.UniqueID,
		Region:       d.Region,
		Desc:         d.VideoDesc,
		Cover:        sign(d.ReflowCover),
		Avatar:       sign(d.Avatar),
		Duration:     d.Duration.Int(),
		CreateTime:   string(d.CreateTime),
		IsAd:         d.IsAd.Int() == 1,
		CreatedByAI:  string(d.CreatedByAI) == "true",
		Views:        d.TotalViewsCnt.Int(),
		Views7d:      d.TotalViews7dCnt.Int(),
		Views30d:     d.TotalViews30dCnt.Int(),
		Digg:         d.TotalDiggCnt.Int(),
		Comments:     d.TotalCommentsCnt.Int(),
		Shares:       d.TotalSharesCnt.Int(),
		Favorites:    d.TotalFavoritesCnt.Int(),
		SaleCnt:      d.TotalVideoSaleCnt.Int(),
		SaleGmvCents: echotik.DollarsToCents(d.TotalVideoSaleGmv.Float()),
		Products:     make([]EntityProductDTO, 0, len(prods)),
	}
	for i, pr := range prods {
		dto.Products = append(dto.Products, EntityProductDTO{
			ProductID:      pr.ProductID,
			Name:           pr.ProductName,
			Cover:          sign(prodRaw[i]),
			AvgPriceCents:  echotik.DollarsToCents(pr.SpuAvgPrice.Float()),
			CommissionRate: pr.ProductCommissionRate.Float(),
			Rating:         pr.ProductRating.Float(),
		})
	}
	s.cacheSetJSON(ctx, key, dto)
	return dto, nil
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
