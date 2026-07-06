package service

import (
	"context"
	"sort"
	"strings"

	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/service/echotik"
)

// HotVideoRef 一条「已跑出销量」的真实带货视频精简引用,供 DIRECTOR 逆向钩子/结构用。
type HotVideoRef struct {
	Desc     string `json:"desc"`     // 视频文案(已去 #话题 / @提及)
	SaleCnt  int    `json:"saleCnt"`  // 该视频带货销量
	GmvCents int    `json:"gmvCents"` // 该视频带货 GMV(分)
}

// hotMinDescRunes 文案去标签后短于此长度视为纯标签/无钩子价值,丢弃。
const hotMinDescRunes = 8

// TopSellingVideos 取某商品已跑出销量的真实带货视频(按销量降序,过滤空/纯标签文案),
// 商品自身有效视频不足 2 条且有品类时,并入该品类销量视频榜再选。
// best-effort:externalID/region 为空、上游失败或无数据时返回 nil,绝不阻断脚本生成。
func (s *DiscoverService) TopSellingVideos(ctx context.Context, externalID, region, categoryID string, limit int) []HotVideoRef {
	if strings.TrimSpace(externalID) == "" || strings.TrimSpace(region) == "" {
		return nil
	}
	if limit <= 0 {
		limit = 5
	}

	// 主路:该商品自己的真实带货视频(优先读已落库详情,无则 best-effort 拉)。
	candidates := make([]HotVideoRef, 0, 10)
	for _, v := range s.productVideosCached(ctx, externalID, region) {
		candidates = append(candidates, HotVideoRef{Desc: v.Desc, SaleCnt: v.SaleCnt, GmvCents: v.SaleGmvCents})
	}
	refs := selectTopHotVideos(candidates, limit)

	// 兜底:自身有效条数不足且有品类时,并入该品类销量视频榜再选一次(去重在 select 内做)。
	if len(refs) < 2 && strings.TrimSpace(categoryID) != "" {
		candidates = append(candidates, s.categoryHotVideos(ctx, region, categoryID)...)
		refs = selectTopHotVideos(candidates, limit)
	}
	return refs
}

// productVideosCached 取商品带货视频:优先读已落库详情(零 EchoTik),无则 best-effort 拉。
func (s *DiscoverService) productVideosCached(ctx context.Context, externalID, region string) []ProductVideoDTO {
	if dp, err := s.findDiscover(ctx, externalID, region); err == nil {
		if vids := parseProductVideos(dp.DetailVideos); len(vids) > 0 {
			return vids
		}
	}
	if !s.echo.Configured() {
		return nil
	}
	return s.fetchProductVideos(ctx, externalID, region)
}

// selectTopHotVideos 过滤(销量>0、去标签后≥hotMinDescRunes 字、按文案去重)→ 按销量降序 → 截断到 limit。
// 纯函数,不触网/不读库,便于单测。
func selectTopHotVideos(candidates []HotVideoRef, limit int) []HotVideoRef {
	if limit <= 0 {
		limit = 5
	}
	out := make([]HotVideoRef, 0, limit)
	seen := map[string]bool{}
	for _, c := range candidates {
		if c.SaleCnt <= 0 {
			continue
		}
		desc := cleanHotDesc(c.Desc)
		if len([]rune(desc)) < hotMinDescRunes { // 纯标签 / 过短,无钩子价值
			continue
		}
		if seen[desc] {
			continue
		}
		seen[desc] = true
		out = append(out, HotVideoRef{Desc: desc, SaleCnt: c.SaleCnt, GmvCents: c.GmvCents})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].SaleCnt > out[j].SaleCnt })
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

// categoryHotVideos 取某品类销量榜带货视频(Desc 为原文,清洗交给 selectTopHotVideos),复用 6h 实体缓存。
func (s *DiscoverService) categoryHotVideos(ctx context.Context, region, categoryID string) []HotVideoRef {
	key := "hotcat:" + region + ":" + categoryID
	var cached []HotVideoRef
	if _, ok := s.cacheGetJSON(ctx, key, entityCacheTTL, &cached); ok {
		return cached
	}
	if !s.echo.Configured() {
		return nil
	}
	rows, err := s.echo.GetVideoRanklist(ctx, echotik.RanklistParams{
		Region:     region,
		RankType:   echotik.RankHot,
		RankField:  echotik.VideoFieldSales, // 带货榜;此前误传 1(播放热门榜)混入零转化娱乐视频
		CategoryID: categoryID,
		PageSize:   10,
	})
	if err != nil {
		logger.Warn("爆款逆向:取品类视频榜失败",
			logger.String("region", region), logger.String("cat", categoryID), logger.Err(err))
		return nil
	}
	out := make([]HotVideoRef, 0, len(rows))
	for _, r := range rows {
		out = append(out, HotVideoRef{
			Desc:     r.VideoDesc,
			SaleCnt:  r.TotalVideoSaleCnt,
			GmvCents: echotik.DollarsToCents(r.TotalVideoSaleGmvAmt),
		})
	}
	s.cacheSetJSON(ctx, key, out)
	return out
}

// cleanHotDesc 去掉 #话题 / @提及 词、折叠空白,留下可供 LLM 逆向的「钩子文案」。
func cleanHotDesc(s string) string {
	fields := strings.Fields(s)
	kept := make([]string, 0, len(fields))
	for _, w := range fields {
		if strings.HasPrefix(w, "#") || strings.HasPrefix(w, "@") {
			continue
		}
		kept = append(kept, w)
	}
	return strings.TrimSpace(strings.Join(kept, " "))
}
