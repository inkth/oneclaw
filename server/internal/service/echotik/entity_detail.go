package echotik

import (
	"context"
	"fmt"
	"strconv"
	"time"
)

// ── 类型 ─────────────────────────────────────────────────────────────────────

// SellerDetail 店铺详情(/echotik/seller/detail)。
type SellerDetail struct {
	SellerID                string    `json:"seller_id"`
	SellerName              string    `json:"seller_name"`
	Region                  string    `json:"region"`
	CoverURL                string    `json:"cover_url"` // 单图,防盗链
	SellerLink              string    `json:"seller_link"`
	Rating                  FlexFloat `json:"rating"`
	MostProductCategoryList string    `json:"most_product_category_list"` // stringified JSON
	SpuAvgPrice             FlexFloat `json:"spu_avg_price"`
	TotalProductCnt         FlexFloat `json:"total_product_cnt"`       // 历史在店商品数(含下架)
	TotalCrawlProductCnt    FlexFloat `json:"total_crawl_product_cnt"` // 在售(在店)商品数
	TotalSaleCnt            FlexFloat `json:"total_sale_cnt"`
	TotalSaleGmvAmt         FlexFloat `json:"total_sale_gmv_amt"`
	TotalIflCnt             FlexFloat `json:"total_ifl_cnt"`
	TotalVideoCnt           FlexFloat `json:"total_video_cnt"`
	TotalLiveCnt            FlexFloat `json:"total_live_cnt"`
	TotalSale7dCnt          FlexFloat `json:"total_sale_7d_cnt"`
	TotalSale30dCnt         FlexFloat `json:"total_sale_30d_cnt"`
	TotalSaleGmv7dAmt       FlexFloat `json:"total_sale_gmv_7d_amt"`
	TotalSaleGmv30dAmt      FlexFloat `json:"total_sale_gmv_30d_amt"`
}

// EntityProduct 店铺旗下商品(/echotik/seller/product/list 行,字段子集)。
type EntityProduct struct {
	ProductID             string    `json:"product_id"`
	ProductName           string    `json:"product_name"`
	CoverURL              string    `json:"cover_url"` // stringified JSON 数组 或单图
	Region                string    `json:"region"`
	MinPrice              FlexFloat `json:"min_price"`
	MaxPrice              FlexFloat `json:"max_price"`
	ProductCommissionRate FlexFloat `json:"product_commission_rate"`
	ProductRating         FlexFloat `json:"product_rating"`
}

// SellerTrendPoint 店铺每日趋势(/echotik/seller/trend)。
type SellerTrendPoint struct {
	Dt              string    `json:"dt"`
	Sale1dCnt       FlexFloat `json:"total_sale_1d_cnt"`
	SaleGmv1dAmt    FlexFloat `json:"total_sale_gmv_1d_amt"`
	TotalProductCnt FlexFloat `json:"total_product_cnt"`
	TotalVideoCnt   FlexFloat `json:"total_video_cnt"`
}

// InfluencerDetail 达人详情(/echotik/influencer/detail)。
type InfluencerDetail struct {
	UserID          string    `json:"user_id"`
	UniqueID        string    `json:"unique_id"`
	NickName        string    `json:"nick_name"`
	Region          string    `json:"region"`
	Avatar          string    `json:"avatar"`
	Category        string    `json:"category"`
	Gender          string    `json:"gender"`
	Language        string    `json:"language"`
	ContactEmail    string    `json:"contact_email"`
	Signature       string    `json:"signature"`
	EcScore         FlexFloat `json:"ec_score"`
	InteractionRate FlexFloat `json:"interaction_rate"`

	TotalFollowersCnt    FlexFloat `json:"total_followers_cnt"`
	TotalFollowers30dCnt FlexFloat `json:"total_followers_30d_cnt"`
	TotalPostVideoCnt    FlexFloat `json:"total_post_video_cnt"`
	TotalDiggCnt         FlexFloat `json:"total_digg_cnt"`
	TotalViewsCnt        FlexFloat `json:"total_views_cnt"`
	TotalProductCnt      FlexFloat `json:"total_product_cnt"`
	TotalSaleCnt         FlexFloat `json:"total_sale_cnt"`
	TotalSaleGmvAmt      FlexFloat `json:"total_sale_gmv_amt"`
	TotalLiveCnt         FlexFloat `json:"total_live_cnt"`
}

// InfluencerVideo 达人视频(/echotik/influencer/video/list)。
type InfluencerVideo struct {
	VideoID           string     `json:"video_id"`
	UniqueID          string     `json:"unique_id"`
	UserID            string     `json:"user_id"`
	Region            string     `json:"region"`
	VideoDesc         string     `json:"video_desc"`
	ReflowCover       string     `json:"reflow_cover"`
	Duration          FlexFloat  `json:"duration"`
	CreateTime        FlexString `json:"create_time"`
	IsAd              FlexFloat  `json:"is_ad"`
	TotalViewsCnt     FlexFloat  `json:"total_views_cnt"`
	TotalDiggCnt      FlexFloat  `json:"total_digg_cnt"`
	TotalCommentsCnt  FlexFloat  `json:"total_comments_cnt"`
	TotalSharesCnt    FlexFloat  `json:"total_shares_cnt"`
	TotalVideoSaleCnt FlexFloat  `json:"total_video_sale_cnt"`
	TotalVideoSaleGmv FlexFloat  `json:"total_video_sale_gmv_amt"`
}

// InfluencerTrendPoint 达人每日趋势(/echotik/influencer/trend)。
type InfluencerTrendPoint struct {
	Dt                string    `json:"dt"`
	TotalFollowersCnt FlexFloat `json:"total_followers_cnt"`
	Followers1dCnt    FlexFloat `json:"total_followers_1d_cnt"`
	Sale1dCnt         FlexFloat `json:"total_sale_1d_cnt"`
	SaleGmv1dAmt      FlexFloat `json:"total_sale_gmv_1d_amt"`
}

// VideoDetail 视频详情(/echotik/video/detail)。
type VideoDetail struct {
	VideoID       string     `json:"video_id"`
	UserID        string     `json:"user_id"`
	UniqueID      string     `json:"unique_id"`
	Region        string     `json:"region"`
	VideoDesc     string     `json:"video_desc"`
	ReflowCover   string     `json:"reflow_cover"` // 防盗链
	Avatar        string     `json:"avatar"`       // 防盗链
	Duration      FlexFloat  `json:"duration"`
	CreateTime    FlexString `json:"create_time"`
	IsAd          FlexFloat  `json:"is_ad"`
	CreatedByAI   FlexString `json:"created_by_ai"`
	VideoProducts string     `json:"video_products"` // stringified JSON: [productId, ...]

	TotalViewsCnt     FlexFloat `json:"total_views_cnt"`
	TotalViews7dCnt   FlexFloat `json:"total_views_7d_cnt"`
	TotalViews30dCnt  FlexFloat `json:"total_views_30d_cnt"`
	TotalDiggCnt      FlexFloat `json:"total_digg_cnt"`
	TotalCommentsCnt  FlexFloat `json:"total_comments_cnt"`
	TotalSharesCnt    FlexFloat `json:"total_shares_cnt"`
	TotalFavoritesCnt FlexFloat `json:"total_favorites_cnt"`
	TotalVideoSaleCnt FlexFloat `json:"total_video_sale_cnt"`
	TotalVideoSaleGmv FlexFloat `json:"total_video_sale_gmv_amt"`
}

func (c *Client) GetVideoDetail(ctx context.Context, videoID, region string) (*VideoDetail, error) {
	var env Envelope[[]VideoDetail]
	if err := c.call(ctx, "/echotik/video/detail", map[string]string{"video_ids": videoID, "region": region}, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	if len(env.Data) == 0 {
		return nil, nil
	}
	return &env.Data[0], nil
}

// ── 店铺 ─────────────────────────────────────────────────────────────────────

func (c *Client) GetSellerDetail(ctx context.Context, sellerID, region string) (*SellerDetail, error) {
	var env Envelope[[]SellerDetail]
	if err := c.call(ctx, "/echotik/seller/detail", map[string]string{"seller_ids": sellerID, "region": region}, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	if len(env.Data) == 0 {
		return nil, nil
	}
	return &env.Data[0], nil
}

func (c *Client) GetSellerProducts(ctx context.Context, sellerID, region string, pageSize int) ([]EntityProduct, error) {
	if pageSize <= 0 || pageSize > productDetailPageCap {
		pageSize = productDetailPageCap
	}
	var env Envelope[[]EntityProduct]
	if err := c.call(ctx, "/echotik/seller/product/list", map[string]string{
		"seller_id": sellerID, "region": region, "page_num": "1", "page_size": strconv.Itoa(pageSize),
	}, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

func (c *Client) GetSellerTrend(ctx context.Context, sellerID, region string, days int) ([]SellerTrendPoint, error) {
	start, end, pages := trendWindow(days)
	var all []SellerTrendPoint
	for page := 1; page <= pages; page++ {
		var env Envelope[[]SellerTrendPoint]
		if err := c.call(ctx, "/echotik/seller/trend", map[string]string{
			"seller_id": sellerID, "region": region, "start_date": start, "end_date": end,
			"page_num": strconv.Itoa(page), "page_size": strconv.Itoa(productDetailPageCap),
		}, &env); err != nil {
			return all, err
		}
		if env.Code != 0 && env.Code != 200 {
			return all, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
		}
		if len(env.Data) == 0 {
			break
		}
		all = append(all, env.Data...)
		if len(env.Data) < productDetailPageCap {
			break
		}
	}
	return all, nil
}

// ── 达人 ─────────────────────────────────────────────────────────────────────

func (c *Client) GetInfluencerDetail(ctx context.Context, userID, region string) (*InfluencerDetail, error) {
	var env Envelope[[]InfluencerDetail]
	if err := c.call(ctx, "/echotik/influencer/detail", map[string]string{"user_ids": userID, "region": region}, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	if len(env.Data) == 0 {
		return nil, nil
	}
	return &env.Data[0], nil
}

func (c *Client) GetInfluencerVideos(ctx context.Context, userID, region string, pageSize int) ([]InfluencerVideo, error) {
	if pageSize <= 0 || pageSize > productDetailPageCap {
		pageSize = productDetailPageCap
	}
	var env Envelope[[]InfluencerVideo]
	if err := c.call(ctx, "/echotik/influencer/video/list", map[string]string{
		"user_id": userID, "region": region, "page_num": "1", "page_size": strconv.Itoa(pageSize),
	}, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

func (c *Client) GetInfluencerTrend(ctx context.Context, userID, region string, days int) ([]InfluencerTrendPoint, error) {
	start, end, pages := trendWindow(days)
	var all []InfluencerTrendPoint
	for page := 1; page <= pages; page++ {
		var env Envelope[[]InfluencerTrendPoint]
		if err := c.call(ctx, "/echotik/influencer/trend", map[string]string{
			"user_id": userID, "region": region, "start_date": start, "end_date": end,
			"page_num": strconv.Itoa(page), "page_size": strconv.Itoa(productDetailPageCap),
		}, &env); err != nil {
			return all, err
		}
		if env.Code != 0 && env.Code != 200 {
			return all, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
		}
		if len(env.Data) == 0 {
			break
		}
		all = append(all, env.Data...)
		if len(env.Data) < productDetailPageCap {
			break
		}
	}
	return all, nil
}

// trendWindow 返回近 days 天的 [start,end] 与需翻的页数(end=T-1,服务端单页≤10)。
func trendWindow(days int) (string, string, int) {
	if days <= 0 {
		days = 14
	}
	end := time.Now().AddDate(0, 0, -1)
	start := end.AddDate(0, 0, -(days - 1))
	pages := (days + productDetailPageCap - 1) / productDetailPageCap
	if pages > 6 {
		pages = 6
	}
	return start.Format("2006-01-02"), end.Format("2006-01-02"), pages
}
