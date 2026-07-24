package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/faxianmao/server/internal/model"
)

// ── 选品官工具:本地商品库检索 ───────────────────────────────────────────────
//
// 给 SCOUT 的 search_products 工具用:纯本地 DB 查询,零 EchoTik 调用、零缓存键污染。
// 库里的行由 DiscoverSync 保鲜,近 7 天窗口列可能部分为 0(低销量行按门槛跳过 enrich)。

// ScoutSearchArgs search_products 的入参(模型给 JSON,字段全部可选)。
type ScoutSearchArgs struct {
	Keywords         []string `json:"keywords"`
	MinPriceUsd      float64  `json:"minPriceUsd"`
	MaxPriceUsd      float64  `json:"maxPriceUsd"`
	MinCommissionPct float64  `json:"minCommissionPct"`
	Sort             string   `json:"sort"` // sale7d(默认)|total_sale|commission|accel
	Limit            int      `json:"limit"`
}

// Describe 给流式进度行用的一句话查询描述。
func (a ScoutSearchArgs) Describe() string {
	parts := make([]string, 0, 4)
	if len(a.Keywords) > 0 {
		parts = append(parts, "关键词「"+strings.Join(a.Keywords, " / ")+"」")
	}
	if a.MaxPriceUsd > 0 {
		parts = append(parts, fmt.Sprintf("价格≤$%.0f", a.MaxPriceUsd))
	}
	if a.MinPriceUsd > 0 {
		parts = append(parts, fmt.Sprintf("价格≥$%.0f", a.MinPriceUsd))
	}
	if a.MinCommissionPct > 0 {
		parts = append(parts, fmt.Sprintf("佣金≥%.0f%%", a.MinCommissionPct))
	}
	switch a.Sort {
	case "commission":
		parts = append(parts, "按佣金排序")
	case "total_sale":
		parts = append(parts, "按累计销量排序")
	case "accel":
		parts = append(parts, "按爆发加速度排序")
	default:
		parts = append(parts, "按近7天销量排序")
	}
	return strings.Join(parts, " · ")
}

// likeEscape 转义 ILIKE 通配符,防止关键词里的 %/_ 变成任意匹配。
func likeEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	return strings.ReplaceAll(s, `_`, `\_`)
}

// ScoutSearchProducts 按条件检索本地商品库,返回压缩事实块(工具结果给模型读)与命中数。
// region/类目来自用户订阅(服务端注入),模型只控制关键词与数值筛选。
func (s *DiscoverService) ScoutSearchProducts(ctx context.Context, region string, cat CategoryFilter, a ScoutSearchArgs) (string, int) {
	if s.db == nil {
		return "本地数据库不可用。", 0
	}
	limit := a.Limit
	if limit <= 0 {
		limit = 8
	}
	if limit > 12 {
		limit = 12
	}

	q := s.db.WithContext(ctx).Model(&model.DiscoverProduct{}).
		Where("provider = ? AND region = ?", providerEchoTik, region)
	if col, val := cat.column(); col != "" {
		q = q.Where(col+" = ?", val)
	}
	// 关键词组间 OR:任一词命中原文名或中文译名即可。最多取 5 个词防超长 SQL。
	kws := make([]string, 0, 5)
	for _, kw := range a.Keywords {
		if kw = strings.TrimSpace(kw); kw != "" && len(kws) < 5 {
			kws = append(kws, kw)
		}
	}
	if len(kws) > 0 {
		conds := make([]string, 0, len(kws))
		vals := make([]any, 0, len(kws)*2)
		for _, kw := range kws {
			pat := "%" + likeEscape(kw) + "%"
			conds = append(conds, "(name ILIKE ? OR name_zh ILIKE ?)")
			vals = append(vals, pat, pat)
		}
		q = q.Where(strings.Join(conds, " OR "), vals...)
	}
	if a.MinPriceUsd > 0 {
		q = q.Where("avg_price_cents >= ?", int(a.MinPriceUsd*100))
	}
	if a.MaxPriceUsd > 0 {
		q = q.Where("avg_price_cents <= ?", int(a.MaxPriceUsd*100))
	}
	if a.MinCommissionPct > 0 {
		q = q.Where("commission_rate >= ?", a.MinCommissionPct)
	}

	switch a.Sort {
	case "commission":
		// 纯佣金排序会被零销量长尾霸榜,加个最低热度门槛。
		q = q.Where("total_sale_cnt >= 100").Order("commission_rate DESC, sale7d_cnt DESC")
	case "total_sale":
		q = q.Order("total_sale_cnt DESC")
	case "accel":
		q = q.Where("sale7d_cnt >= ?", risingAccelMinSale).
			Order("sale7d_cnt::float / GREATEST(COALESCE(NULLIF((detail_extras->>'totalSaleCnt')::numeric, 0), total_sale_cnt), sale7d_cnt, 1) DESC")
	default:
		// 近 7 天动量优先;无窗口数据的行(sale7d=0)排后而不是排除,冷门关键词仍有结果。
		q = q.Order("sale7d_cnt DESC, total_sale_cnt DESC")
	}

	var dps []model.DiscoverProduct
	if err := q.Limit(limit).Find(&dps).Error; err != nil {
		return "查询出错:" + err.Error(), 0
	}
	if len(dps) == 0 {
		return "没有找到匹配的商品。可以放宽条件重查;若关键词较冷门,本地库可能未覆盖,请如实告知用户并建议他到「商品榜」页用搜索框搜一次(那会触发上游实时搜索并把结果收进库里)。", 0
	}

	var b strings.Builder
	fmt.Fprintf(&b, "共 %d 个匹配(EchoTik 真实数据,%s 站):\n", len(dps), region)
	for i, dp := range dps {
		name := dp.NameZh
		if name == "" {
			name = dp.Name
		}
		fmt.Fprintf(&b, "#%d id=%s | %s | 均价$%.2f | 佣金%.1f%% | 近7天销量%d | 近7天GMV$%.0f | 累计销量%d | 达人%d | 挂车视频%d\n",
			i+1, dp.ExternalID, name,
			float64(dp.AvgPriceCents)/100, dp.CommissionRate,
			dp.Sale7dCnt, float64(dp.Gmv7dCents)/100,
			dp.TotalSaleCnt, dp.TotalIflCnt, dp.TotalVideoCnt)
	}
	b.WriteString("(近7天列为 0 表示该行暂无窗口数据,不代表没有销量。)")
	return b.String(), len(dps)
}
