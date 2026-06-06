// Package echotik 是 EchoTik 开放 API(TikTok Shop 选品数据源)的 Go 客户端,
// 移植自 Next 版 lib/echotik/*。Phase 1 聚焦榜单(ranklist)。
package echotik

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
)

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

// RanklistParams 榜单查询参数。
type RanklistParams struct {
	Region    string
	RankType  int
	RankField int
	Date      string // YYYY-MM-DD,空则自动回退到昨天
	PageNum   int
	PageSize  int
}
