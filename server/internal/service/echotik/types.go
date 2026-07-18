// Package echotik 是 EchoTik 开放 API(TikTok Shop 选品数据源)的 Go 客户端,
// 移植自 Next 版 lib/echotik/*。Phase 1 聚焦榜单(ranklist)。
package echotik

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
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

	// 店铺/达人/视频三榜(entity ranklist)的排序字段语义各不相同,不是「1=销量/2=GMV」:
	//   店铺 seller_rank_field:     1=total_sale_cnt(热销)      2=total_ifl_cnt(合作达人数)
	//   达人 influencer_rank_field: 1=total_followers_cnt(粉丝) 2=total_sale_cnt(带货)
	//   视频 video_rank_field:      1=total_views_cnt(播放热门) 2=total_video_sale_cnt(带货)
	// 选品场景默认:店铺=热销(1),达人/视频=带货(2)。
	// 另注意:三榜的 rank_type 是周期(1=日/2=周/3=月),与商品榜的 hot/rising/new 不同,
	// 现默认传 RankHot(=1) 恰好等于日榜。
	SellerFieldSales         = 1
	SellerFieldPromoters     = 2
	InfluencerFieldFollowers = 1
	InfluencerFieldSales     = 2
	VideoFieldViews          = 1
	VideoFieldSales          = 2
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

// FlexFloat 兼容 EchoTik 数值字段时而是数字、时而是带引号字符串(甚至 "48%")。
// 解析时剥引号、去掉末尾 %,失败则归零(不让单个脏字段整条 detail 解析失败)。
type FlexFloat float64

func (f *FlexFloat) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if s == "" || s == "null" {
		*f = 0
		return nil
	}
	s = strings.Trim(s, `"`)
	s = strings.TrimSuffix(s, "%")
	if s == "" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		*f = 0
		return nil
	}
	*f = FlexFloat(v)
	return nil
}

func (f FlexFloat) Float() float64 { return float64(f) }
func (f FlexFloat) Int() int       { return int(f) }

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

// ProductDetail 商品详情(/echotik/product/detail)。封面取 cover_url;其余字段供选品详情页/评分用。
// 数值字段一律用 FlexFloat 容错(EchoTik 偶有字符串/百分号)。
type ProductDetail struct {
	ProductID string `json:"product_id"`
	CoverURL  string `json:"cover_url"` // stringified JSON: [{"url":...,"index":N}, ...],防盗链原始 URL,需签名

	ProductName           string    `json:"product_name"`
	MinPrice              FlexFloat `json:"min_price"`
	MaxPrice              FlexFloat `json:"max_price"`
	SpuAvgPrice           FlexFloat `json:"spu_avg_price"`
	ProductCommissionRate FlexFloat `json:"product_commission_rate"`

	ProductRating FlexFloat  `json:"product_rating"`
	ReviewCount   FlexFloat  `json:"review_count"`
	DescDetail    string     `json:"desc_detail"` // stringified JSON 富文本块
	Discount      FlexString `json:"discount"`    // 形如 "48%"
	FreeShipping  FlexFloat  `json:"free_shipping"`
	SellerID      string     `json:"seller_id"`

	// 累计总量(权威值,优于榜单行里的窗口/排名口径)。
	TotalSaleCnt    FlexFloat `json:"total_sale_cnt"`
	TotalSaleGmvAmt FlexFloat `json:"total_sale_gmv_amt"`
	TotalIflCnt     FlexFloat `json:"total_ifl_cnt"`
	TotalVideoCnt   FlexFloat `json:"total_video_cnt"`
	TotalLiveCnt    FlexFloat `json:"total_live_cnt"`

	// 多周期窗口(选品看「近 7/30 天」势头)。
	TotalSale7dCnt  FlexFloat `json:"total_sale_7d_cnt"`
	TotalSale30dCnt FlexFloat `json:"total_sale_30d_cnt"`
	TotalSale90dCnt FlexFloat `json:"total_sale_90d_cnt"`

	TotalSaleGmv7dAmt  FlexFloat `json:"total_sale_gmv_7d_amt"`
	TotalSaleGmv30dAmt FlexFloat `json:"total_sale_gmv_30d_amt"`

	TotalVideo7dCnt  FlexFloat `json:"total_video_7d_cnt"`
	TotalVideo30dCnt FlexFloat `json:"total_video_30d_cnt"`
	TotalLive7dCnt   FlexFloat `json:"total_live_7d_cnt"`
}

// ProductInfluencer 带货达人(/echotik/product/influencer/list)。
type ProductInfluencer struct {
	UserID            string    `json:"user_id"`
	NickName          string    `json:"nick_name"`
	Avatar            string    `json:"avatar"` // 防盗链,需签名
	Category          string    `json:"category"`
	Region            string    `json:"region"`
	ProductID         string    `json:"product_id"`
	PerProductGmvAmt  FlexFloat `json:"per_product_ifl_gmv_amt"`
	PerProductSaleCnt FlexFloat `json:"per_product_ifl_sale_cnt"`
	TotalFollowersCnt FlexFloat `json:"total_followers_cnt"`
	TotalDiggCnt      FlexFloat `json:"total_digg_cnt"`
	TotalPostVideoCnt FlexFloat `json:"total_post_video_cnt"`
	TotalLiveCnt      FlexFloat `json:"total_live_cnt"`
}

// ProductVideo 关联带货视频(/echotik/product/video/list)。
type ProductVideo struct {
	VideoID           string     `json:"video_id"`
	ProductID         string     `json:"product_id"`
	UserID            string     `json:"user_id"`
	Region            string     `json:"region"`
	CreateTime        FlexString `json:"create_time"` // unix 秒
	Duration          FlexFloat  `json:"duration"`
	ReflowCover       string     `json:"reflow_cover"` // 防盗链,需签名
	PlayAddr          string     `json:"play_addr"`
	HashTag           string     `json:"hash_tag"`
	VideoDesc         string     `json:"video_desc"`
	TotalViewsCnt     FlexFloat  `json:"total_views_cnt"`
	TotalDiggCnt      FlexFloat  `json:"total_digg_cnt"`
	TotalCommentsCnt  FlexFloat  `json:"total_comments_cnt"`
	TotalSharesCnt    FlexFloat  `json:"total_shares_cnt"`
	TotalVideoSaleCnt FlexFloat  `json:"total_video_sale_cnt"`
	TotalVideoSaleGmv FlexFloat  `json:"total_video_sale_gmv_amt"`
}

// ProductTrendPoint 每日趋势点(/echotik/product/trend)。
type ProductTrendPoint struct {
	Dt              string    `json:"dt"` // YYYY-MM-DD
	ProductID       string    `json:"product_id"`
	SpuAvgPrice     FlexFloat `json:"spu_avg_price"`
	TotalSaleCnt    FlexFloat `json:"total_sale_cnt"`
	TotalSaleGmvAmt FlexFloat `json:"total_sale_gmv_amt"`
	Sale1dCnt       FlexFloat `json:"total_sale_1d_cnt"`
	SaleGmv1dAmt    FlexFloat `json:"total_sale_gmv_1d_amt"`
	TotalIflCnt     FlexFloat `json:"total_ifl_cnt"`
	TotalVideoCnt   FlexFloat `json:"total_video_cnt"`
	TotalLiveCnt    FlexFloat `json:"total_live_cnt"`
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
	Keyword    string // 非空=走关键词搜索(/echotik/search/items)而非榜单
	// CreatedByAI 仅视频榜有效:"true"=只看 AI 生成视频、"false"=只看真人视频、""=不限。
	// 上游 /echotik/video/ranklist 原生支持 created_by_ai 参数(店铺/达人榜忽略此字段)。
	CreatedByAI string
}

// Category 一级类目行。
type Category struct {
	CategoryID   string `json:"category_id"`
	CategoryName string `json:"category_name"`
	ParentID     string `json:"parent_id"`
}

// SellerListItem 店铺榜 / 搜索行。
type SellerListItem struct {
	SellerID                string    `json:"seller_id"`
	SellerName              string    `json:"seller_name"`
	Region                  string    `json:"region"`
	CoverURL                string    `json:"cover_url"`                  // 防盗链原始 URL,需签名
	Rating                  FlexFloat `json:"rating"`                     // 榜单回数字、搜索回字符串("4.4"),用 FlexFloat 兼容
	MostProductCategoryList string    `json:"most_product_category_list"` // stringified JSON: [{category_name,...}]
	TotalProductCnt         int       `json:"total_product_cnt"`
	TotalSaleCnt            int       `json:"total_sale_cnt"`
	TotalSaleGmvAmt         float64   `json:"total_sale_gmv_amt"`
	TotalIflCnt             int       `json:"total_ifl_cnt"`
	TotalVideoCnt           int       `json:"total_video_cnt"`
	TotalLiveCnt            int       `json:"total_live_cnt"`
}

// InfluencerListItem 达人榜行。注意口径:total_* 是「榜单周期增量」(文档明示),
// _history_* 才是累计总量;搜索行(/search/items)可能没有 history 字段(解析为 0)。
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

	// 累计总量(_history_ 后缀,与 detail 口径一致)。
	TotalFollowersHistoryCnt int     `json:"total_followers_history_cnt"`
	TotalDiggHistoryCnt      int     `json:"total_digg_history_cnt"`
	TotalProductHistoryCnt   int     `json:"total_product_history_cnt"`
	TotalPostVideoHistoryCnt int     `json:"total_post_video_history_cnt"`
	TotalLiveHistoryCnt      int     `json:"total_live_history_cnt"`
	TotalSaleHistoryCnt      int     `json:"total_sale_history_cnt"`
	TotalSaleGmvHistoryAmt   float64 `json:"total_sale_gmv_history_amt"`
}

// CumFollowers 等:优先取累计(_history);缺失(0,搜索行没有该字段)退 total_* ——
// 搜索接口无榜单周期概念,其 total_* 本身即累计,退回值口径仍对。
func (it InfluencerListItem) CumFollowers() int { return firstPos(it.TotalFollowersHistoryCnt, it.TotalFollowersCnt) }
func (it InfluencerListItem) CumDigg() int      { return firstPos(it.TotalDiggHistoryCnt, it.TotalDiggCnt) }
func (it InfluencerListItem) CumProduct() int   { return firstPos(it.TotalProductHistoryCnt, it.TotalProductCnt) }
func (it InfluencerListItem) CumPostVideo() int { return firstPos(it.TotalPostVideoHistoryCnt, it.TotalPostVideoCnt) }
func (it InfluencerListItem) CumLive() int      { return firstPos(it.TotalLiveHistoryCnt, it.TotalLiveCnt) }
func (it InfluencerListItem) CumSale() int      { return firstPos(it.TotalSaleHistoryCnt, it.TotalSaleCnt) }
func (it InfluencerListItem) CumSaleGmv() float64 {
	if it.TotalSaleGmvHistoryAmt > 0 {
		return it.TotalSaleGmvHistoryAmt
	}
	return it.TotalSaleGmvAmt
}

func firstPos(vals ...int) int {
	for _, v := range vals {
		if v > 0 {
			return v
		}
	}
	return 0
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
