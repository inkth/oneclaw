package echotik

import (
	"context"
	"fmt"
	"strconv"
)

// EchoTik 关键词搜索走统一聚合端点 /echotik/search/items(与 ranklist 同域同 auth)。
// type 区分实体;返回项字段与对应 ranklist 行一致,故直接复用 *ListItem 结构体。
const (
	searchTypeInfluencer = 1
	searchTypeProduct    = 2
	searchTypeSeller     = 3
	searchTypeVideo      = 4
)

// SearchMaxSize 搜索单次条数上限:接口固定最多 30、无分页。
const SearchMaxSize = 30

// searchItems 调 /echotik/search/items。sk=关键词,size 夹在 1..30,region 可选。
// 不传 searchType(默认模糊),sortType 仅商品有效、暂不暴露。
func searchItems[T any](ctx context.Context, c *Client, typ int, keyword, region string, size int) ([]T, error) {
	if size <= 0 || size > SearchMaxSize {
		size = SearchMaxSize
	}
	params := map[string]string{
		"sk":     keyword,
		"type":   strconv.Itoa(typ),
		"size":   strconv.Itoa(size),
		"region": region,
	}
	var env Envelope[[]T]
	if err := c.call(ctx, "/echotik/search/items", params, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

// SearchProducts 关键词搜商品(type=2)。返回项不内联可用封面(同榜单),由调用方走 detail 补图。
func (c *Client) SearchProducts(ctx context.Context, keyword, region string, size int) ([]ProductListItem, error) {
	return searchItems[ProductListItem](ctx, c, searchTypeProduct, keyword, region, size)
}

// SearchSellers 关键词搜店铺(type=3)。
func (c *Client) SearchSellers(ctx context.Context, keyword, region string, size int) ([]SellerListItem, error) {
	return searchItems[SellerListItem](ctx, c, searchTypeSeller, keyword, region, size)
}

// SearchInfluencers 关键词搜达人(type=1)。
func (c *Client) SearchInfluencers(ctx context.Context, keyword, region string, size int) ([]InfluencerListItem, error) {
	return searchItems[InfluencerListItem](ctx, c, searchTypeInfluencer, keyword, region, size)
}

// SearchVideos 关键词搜视频(type=4)。
func (c *Client) SearchVideos(ctx context.Context, keyword, region string, size int) ([]VideoListItem, error) {
	return searchItems[VideoListItem](ctx, c, searchTypeVideo, keyword, region, size)
}
