// Package echotik 是 EchoTik 开放 API(TikTok Shop 选品数据源)的 Go 客户端,
// 移植自 Next 版 lib/echotik/*。Phase 1 聚焦榜单(ranklist)。
package echotik

import (
	"encoding/json"
	"sort"
)

// Envelope EchoTik 统一响应封套。code==0 或 200 视为成功。
type Envelope[T any] struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      T      `json:"data"`
	RequestID string `json:"requestId"`
}

// 榜单类型 / 排序字段(数值枚举,与 EchoTik 对齐)。
const (
	RankHot    = 1
	RankRising = 2
	RankNew    = 3

	FieldSales  = 1
	FieldGMV    = 2
	FieldGrowth = 3

	// 店铺/达人/视频榜的排序字段只接受 1=销量 / 2=GMV。
	EntityFieldSales = 1
	EntityFieldGMV   = 2
)

// FlexString 兼容 EchoTik 把数值字段(如 create_time)有时返回数字、有时返回字符串。
// 反序列化时统一剥掉引号存成字符串。
type FlexString string

func (f *FlexString) UnmarshalJSON(b []byte) error {
	s := string(b)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		s = s[1 : len(s)-1]
	}
	*f = FlexString(s)
	return nil
}

// ProductListItem 榜单行。
type ProductListItem struct {
	ProductID             string  `json:"product_id"`
	ProductName           string  `json:"product_name"`
	Region                string  `json:"region"`
	CategoryID            string  `json:"category_id"`
	CategoryL2ID          string  `json:"category_l2_id"`
	CategoryL3ID          string  `json:"category_l3_id"`
	MinPrice              float64 `json:"min_price"`
	MaxPrice              float64 `json:"max_price"`
	SpuAvgPrice           float64 `json:"spu_avg_price"`
	ProductCommissionRate float64 `json:"product_commission_rate"`
	TotalSaleCnt          int     `json:"total_sale_cnt"`
	TotalSaleGmvAmt       float64 `json:"total_sale_gmv_amt"`
	TotalIflCnt           int     `json:"total_ifl_cnt"`
	TotalVideoCnt         int     `json:"total_video_cnt"`
	TotalLiveCnt          int     `json:"total_live_cnt"`
}

// ProductDetail 商品详情(榜单不带封面,需走 product/detail 取 cover_url)。当前只取封面。
type ProductDetail struct {
	ProductID string `json:"product_id"`
	CoverURL  string `json:"cover_url"` // stringified JSON: [{"url":...,"index":N}, ...],防盗链原始 URL,需签名
}

// ProductCover cover_url 解析后的单项。
type ProductCover struct {
	URL   string `json:"url"`
	Index int    `json:"index"`
}

// ParseCovers 解析 cover_url(stringified JSON 数组),按 index 升序返回。
func ParseCovers(raw string) []ProductCover {
	if raw == "" {
		return nil
	}
	var arr []ProductCover
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return nil
	}
	sort.SliceStable(arr, func(i, j int) bool { return arr[i].Index < arr[j].Index })
	return arr
}

// RanklistParams 榜单查询参数。
type RanklistParams struct {
	Region     string
	RankType   int
	RankField  int
	CategoryID string // 一级类目 id,空=全部
	Date       string // YYYY-MM-DD,空则自动回退到昨天
	PageNum    int
	PageSize   int
}

// Category 一级类目行。
type Category struct {
	CategoryID   string `json:"category_id"`
	CategoryName string `json:"category_name"`
	ParentID     string `json:"parent_id"`
}

// SellerListItem 店铺榜行。
type SellerListItem struct {
	SellerID                string  `json:"seller_id"`
	SellerName              string  `json:"seller_name"`
	Region                  string  `json:"region"`
	CoverURL                string  `json:"cover_url"` // 防盗链原始 URL,需签名
	Rating                  float64 `json:"rating"`
	MostProductCategoryList string  `json:"most_product_category_list"` // stringified JSON: [{category_name,...}]
	TotalProductCnt         int     `json:"total_product_cnt"`
	TotalSaleCnt            int     `json:"total_sale_cnt"`
	TotalSaleGmvAmt         float64 `json:"total_sale_gmv_amt"`
	TotalIflCnt             int     `json:"total_ifl_cnt"`
	TotalVideoCnt           int     `json:"total_video_cnt"`
	TotalLiveCnt            int     `json:"total_live_cnt"`
}

// InfluencerListItem 达人榜行。
type InfluencerListItem struct {
	UserID            string  `json:"user_id"`
	UniqueID          string  `json:"unique_id"` // @handle
	NickName          string  `json:"nick_name"`
	Region            string  `json:"region"`
	Avatar            string  `json:"avatar"` // 防盗链原始 URL,需签名
	Category          string  `json:"category"`
	EcScore           float64 `json:"ec_score"`
	TotalFollowersCnt int     `json:"total_followers_cnt"`
	TotalDiggCnt      int     `json:"total_digg_cnt"`
	TotalProductCnt   int     `json:"total_product_cnt"`
	TotalPostVideoCnt int     `json:"total_post_video_cnt"`
	TotalLiveCnt      int     `json:"total_live_cnt"`
	TotalSaleCnt      int     `json:"total_sale_cnt"`
	TotalSaleGmvAmt   float64 `json:"total_sale_gmv_amt"`
}

// VideoListItem 带货视频榜行。
type VideoListItem struct {
	VideoID              string     `json:"video_id"`
	NickName             string     `json:"nick_name"`
	UniqueID             string     `json:"unique_id"`
	Region               string     `json:"region"`
	ReflowCover          string     `json:"reflow_cover"` // 防盗链原始 URL,需签名
	Avatar               string     `json:"avatar"`       // 同上
	VideoDesc            string     `json:"video_desc"`
	Category             string     `json:"category"`
	Duration             int        `json:"duration"`
	CreateTime           FlexString `json:"create_time"` // unix 秒,可能是数字或字符串
	TotalViewsCnt        int        `json:"total_views_cnt"`
	TotalDiggCnt         int        `json:"total_digg_cnt"`
	TotalCommentsCnt     int        `json:"total_comments_cnt"`
	TotalSharesCnt       int        `json:"total_shares_cnt"`
	TotalVideoSaleCnt    int        `json:"total_video_sale_cnt"`
	TotalVideoSaleGmvAmt float64    `json:"total_video_sale_gmv_amt"`
}
