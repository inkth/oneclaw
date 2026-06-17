package echotik

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"golang.org/x/sync/errgroup"
)

// 店铺/达人/视频三榜与 product/ranklist 结构一致:region + rank_type +
// <entity>_rank_field + date(T-1 回退)。这里用泛型复用 product 的并发+回退逻辑。
func getEntityRanklist[T any](ctx context.Context, c *Client, endpoint, fieldParam, categoryParam string, p RanklistParams) ([]T, error) {
	desired := p.PageSize
	if desired <= 0 {
		desired = 20
	}
	pageSize := desired
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	startPage := p.PageNum
	if startPage <= 0 {
		startPage = 1
	}
	pagesNeeded := (desired + pageSize - 1) / pageSize

	dates := []string{p.Date}
	if p.Date == "" {
		dates = []string{daysAgo(1), daysAgo(2), daysAgo(3)}
	}

	var lastErr error
	for _, date := range dates {
		results := make([][]T, pagesNeeded)
		g, gctx := errgroup.WithContext(ctx)
		for i := 0; i < pagesNeeded; i++ {
			i := i
			g.Go(func() error {
				params := map[string]string{
					"region":      p.Region,
					"rank_type":   strconv.Itoa(p.RankType),
					fieldParam:    strconv.Itoa(p.RankField),
					categoryParam: p.CategoryID,
					"date":        date,
					"page_size":   strconv.Itoa(pageSize),
					"page_num":    strconv.Itoa(startPage + i),
				}
				var env Envelope[[]T]
				if err := c.call(gctx, endpoint, params, &env); err != nil {
					return err
				}
				if env.Code != 0 && env.Code != 200 {
					return fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
				}
				results[i] = env.Data
				return nil
			})
		}
		if err := g.Wait(); err != nil {
			lastErr = err
			continue
		}
		var all []T
		for _, page := range results {
			all = append(all, page...)
		}
		if len(all) > desired {
			all = all[:desired]
		}
		if len(all) > 0 {
			return all, nil
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return []T{}, nil
}

// GetSellerRanklist 店铺榜。店铺榜的商品类目过滤参数名是 category_id。
func (c *Client) GetSellerRanklist(ctx context.Context, p RanklistParams) ([]SellerListItem, error) {
	return getEntityRanklist[SellerListItem](ctx, c, "/echotik/seller/ranklist", "seller_rank_field", "category_id", p)
}

// GetInfluencerRanklist 达人榜。注意:按「带货商品类目」过滤的参数名是 product_category_id —— 不是
// category_id(传 category_id 会被 EchoTik 忽略 → 切分类返回同一份榜单)。
func (c *Client) GetInfluencerRanklist(ctx context.Context, p RanklistParams) ([]InfluencerListItem, error) {
	return getEntityRanklist[InfluencerListItem](ctx, c, "/echotik/influencer/ranklist", "influencer_rank_field", "product_category_id", p)
}

// GetVideoRanklist 带货视频榜。同达人榜:商品类目过滤参数名是 product_category_id(非 category_id)。
func (c *Client) GetVideoRanklist(ctx context.Context, p RanklistParams) ([]VideoListItem, error) {
	return getEntityRanklist[VideoListItem](ctx, c, "/echotik/video/ranklist", "video_rank_field", "product_category_id", p)
}

// GetProductCovers 按 product_ids 批量取详情,返回 productID -> 封面原始 URL 列表(按 index 升序)。
// 商品榜(product/ranklist)不返回 cover,封面只能从 /echotik/product/detail 拿(防盗链原文,需再签名)。
// 单次最多 detailBatch 个 id。
func (c *Client) GetProductCovers(ctx context.Context, productIDs []string, region string) (map[string][]string, error) {
	out := make(map[string][]string, len(productIDs))
	const detailBatch = 10
	for i := 0; i < len(productIDs); i += detailBatch {
		end := i + detailBatch
		if end > len(productIDs) {
			end = len(productIDs)
		}
		chunk := productIDs[i:end]
		params := map[string]string{
			"product_ids": strings.Join(chunk, ","),
			"region":      region,
		}
		var env Envelope[[]ProductDetail]
		if err := c.call(ctx, "/echotik/product/detail", params, &env); err != nil {
			return out, err
		}
		if env.Code != 0 && env.Code != 200 {
			return out, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
		}
		for _, d := range env.Data {
			covers := ParseCovers(d.CoverURL)
			if len(covers) == 0 {
				continue
			}
			urls := make([]string, 0, len(covers))
			for _, cv := range covers {
				urls = append(urls, cv.URL)
			}
			out[d.ProductID] = urls
		}
	}
	return out, nil
}

// signHost 仅这个 TOS host 的防盗链图才支持批量签名。
const signHost = "echosell-images.tos-ap-southeast-1.volces.com"

// SignCovers 把"防盗链原始 URL"批量换成 3 天有效的签名 URL,返回 raw→signed 映射。
// 单批最多 10 个;非 signHost 的链接直接跳过。未配置凭证时返回空 map(调用方走占位图)。
func (c *Client) SignCovers(ctx context.Context, urls []string) map[string]string {
	out := map[string]string{}
	if !c.Configured() {
		return out
	}
	seen := map[string]bool{}
	eligible := make([]string, 0, len(urls))
	for _, u := range urls {
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		if parsed, err := url.Parse(u); err == nil && parsed.Host == signHost {
			eligible = append(eligible, u)
		}
	}

	const batch = 10
	for i := 0; i < len(eligible); i += batch {
		end := i + batch
		if end > len(eligible) {
			end = len(eligible)
		}
		chunk := eligible[i:end]
		// 响应 data 是 [ {sourceUrl: signedUrl}, ... ]——每个对象一对映射。
		var env Envelope[[]map[string]string]
		if err := c.call(ctx, "/echotik/batch/cover/download", map[string]string{"cover_urls": strings.Join(chunk, ",")}, &env); err != nil {
			continue
		}
		for _, obj := range env.Data {
			for src, dst := range obj {
				out[src] = dst
			}
		}
	}
	return out
}
