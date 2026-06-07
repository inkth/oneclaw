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
func getEntityRanklist[T any](ctx context.Context, c *Client, endpoint, fieldParam string, p RanklistParams) ([]T, error) {
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
					"category_id": p.CategoryID,
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

// GetSellerRanklist 店铺榜。
func (c *Client) GetSellerRanklist(ctx context.Context, p RanklistParams) ([]SellerListItem, error) {
	return getEntityRanklist[SellerListItem](ctx, c, "/echotik/seller/ranklist", "seller_rank_field", p)
}

// GetInfluencerRanklist 达人榜。
func (c *Client) GetInfluencerRanklist(ctx context.Context, p RanklistParams) ([]InfluencerListItem, error) {
	return getEntityRanklist[InfluencerListItem](ctx, c, "/echotik/influencer/ranklist", "influencer_rank_field", p)
}

// GetVideoRanklist 带货视频榜。
func (c *Client) GetVideoRanklist(ctx context.Context, p RanklistParams) ([]VideoListItem, error) {
	return getEntityRanklist[VideoListItem](ctx, c, "/echotik/video/ranklist", "video_rank_field", p)
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
