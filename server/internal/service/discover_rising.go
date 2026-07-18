package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/faxianmao/server/internal/model"
)

// 爆品雷达:纯本地 DB 的动量榜,零 EchoTik 调用。数据源是同步路径顺带落库的
// 近 7 天窗口列(sale7d_cnt/gmv7d_cents),跨榜单/跨类目排序——EchoTik 原榜给的是
// 存量口径(累计销量),雷达给的是动量口径,这是本地数据资产才能做的差异化视图。

// risingAccelMinSale 加速比模式的近 7 天销量下限:总量小的商品随便卖几十件
// 加速比就爆表,设底防小基数噪声霸榜。
const risingAccelMinSale = 100

// RisingProducts 动量榜。mode: "hot7d"=近 7 天销量降序(默认);
// "accel"=加速比(近7天销量/累计销量)降序,新品爆发排前(累计低但 7 天猛涨的黑马)。
// 只读 DB,无 SWR/预热——底层行由榜单同步保鲜,雷达是它们的另一种排序投影。
func (s *DiscoverService) RisingProducts(ctx context.Context, wsID uuid.UUID, region, categoryID, mode string, limit int) *RanklistResult {
	if s.db == nil {
		return &RanklistResult{State: "empty", Products: []DecoratedProduct{}}
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	q := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND sale7d_cnt > 0", providerEchoTik, region)
	if categoryID != "" {
		q = q.Where("category_id = ?", categoryID)
	}
	switch mode {
	case "accel":
		// 分母用详情权威累计(detail_extras,主表 total_sale_cnt 是排名窗口口径会失真);
		// 无详情的行回退窗口口径,并与 sale7d 取大保证比值 ≤1。
		q = q.Where("sale7d_cnt >= ?", risingAccelMinSale).
			Order("sale7d_cnt::float / GREATEST(COALESCE(NULLIF((detail_extras->>'totalSaleCnt')::numeric, 0), total_sale_cnt), sale7d_cnt, 1) DESC")
	default: // hot7d
		q = q.Order("sale7d_cnt DESC")
	}

	var dps []model.DiscoverProduct
	if err := q.Limit(limit).Find(&dps).Error; err != nil {
		return &RanklistResult{State: "error", Products: []DecoratedProduct{}}
	}
	if len(dps) == 0 {
		return &RanklistResult{State: "empty", Products: []DecoratedProduct{}}
	}
	return &RanklistResult{State: "cached", Products: s.decorate(ctx, wsID, dps)}
}
