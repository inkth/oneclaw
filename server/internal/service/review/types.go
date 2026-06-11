// Package review 复盘引擎:解析 GMVMax / Creative Hub 报表 → Cost×ROI 四象限诊断。
// 纯计算,无 DB、无 LLM(只产出可粘进 Gemini 的提示词)。由 TS 版 lib/review 移植而来。
package review

// MetricRow 一条归一化后的广告创意/视频指标行。
type MetricRow struct {
	VideoID     string   // Video ID / Creative ID
	Title       string   // 视频标题(空时回退为 videoId)
	Creator     string   // 达人账号(空 = 无)
	Cost        float64  // 消耗 / 广告花费
	GMV         float64  // 成交金额
	ROI         float64  // 投产比(缺失时由 gmv/cost 推导)
	Impressions float64  // 曝光
	Clicks      float64  // 点击
	Orders      float64  // SKU 订单
	CTR         float64  // 点击率 0..1(缺失时由 clicks/impressions 推导)
	CVR         float64  // 转化率 0..1(缺失时由 orders/clicks 推导)
	View2s      *float64 // 2s 完播率 0..1
	View6s      *float64 // 6s 完播率 0..1
	View100     *float64 // 完播率 0..1
}

// Quadrant Cost×ROI 四象限。
type Quadrant string

const (
	QuadrantWinner    Quadrant = "winner"
	QuadrantPotential Quadrant = "potential"
	QuadrantBleeder   Quadrant = "bleeder"
	QuadrantLongtail  Quadrant = "longtail"
)

var allQuadrants = []Quadrant{QuadrantWinner, QuadrantPotential, QuadrantBleeder, QuadrantLongtail}

// QuadrantItem 象限内的代表样本。
type QuadrantItem struct {
	VideoID  string   `json:"videoId"`
	Title    string   `json:"title"`
	Creator  string   `json:"creator,omitempty"`
	Cost     float64  `json:"cost"`
	GMV      float64  `json:"gmv"`
	ROI      float64  `json:"roi"`
	CTR      float64  `json:"ctr"`
	CVR      float64  `json:"cvr"`
	Orders   float64  `json:"orders"`
	Quadrant Quadrant `json:"quadrant"`
}

// Baseline 大盘健康度基线。
type Baseline struct {
	RowCount      int      `json:"rowCount"`
	TotalCost     float64  `json:"totalCost"`
	TotalGmv      float64  `json:"totalGmv"`
	ROI           float64  `json:"roi"`
	AvgCtr        float64  `json:"avgCtr"`    // 加权 0..1
	AvgCvr        float64  `json:"avgCvr"`    // 加权 0..1
	AvgView2s     *float64 `json:"avgView2s"` // 0..1,无数据则 null
	TargetRoi     float64  `json:"targetRoi"`
	CostThreshold float64  `json:"costThreshold"` // 高/低消耗分界(中位数)
}

// ActionItem 优化行动清单的一条。
type ActionItem struct {
	VideoID  string   `json:"videoId"`
	Title    string   `json:"title"`
	Quadrant Quadrant `json:"quadrant"`
	Problem  string   `json:"problem"`  // 当前问题
	Action   string   `json:"action"`   // 建议操作
	Priority string   `json:"priority"` // P0 / P1 / P2
}

// Result 复盘引擎输出,字段名与前端 lib/review/types.ts 的 ReviewResult 对齐。
type Result struct {
	Baseline     Baseline                    `json:"baseline"`
	Counts       map[Quadrant]int            `json:"counts"`
	Quadrants    map[Quadrant][]QuadrantItem `json:"quadrants"`
	Actions      []ActionItem                `json:"actions"`
	GeminiPrompt string                      `json:"geminiPrompt"`
	Warnings     []string                    `json:"warnings"`
}
