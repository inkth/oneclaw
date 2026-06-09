package echotik

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// productDetailPageCap 这几个 detail 子接口服务端单页上限均为 10。
const productDetailPageCap = 10

// GetProductDetail 取单个商品详情(复用 /echotik/product/detail,product_ids 传一个)。
func (c *Client) GetProductDetail(ctx context.Context, productID, region string) (*ProductDetail, error) {
	params := map[string]string{"product_ids": productID, "region": region}
	var env Envelope[[]ProductDetail]
	if err := c.call(ctx, "/echotik/product/detail", params, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	if len(env.Data) == 0 {
		return nil, nil
	}
	return &env.Data[0], nil
}

// GetProductDetails 批量取商品详情(product_ids 逗号分隔,单批≤10)。用于视频带货商品等场景。
func (c *Client) GetProductDetails(ctx context.Context, productIDs []string, region string) ([]ProductDetail, error) {
	out := make([]ProductDetail, 0, len(productIDs))
	for i := 0; i < len(productIDs); i += productDetailPageCap {
		end := i + productDetailPageCap
		if end > len(productIDs) {
			end = len(productIDs)
		}
		params := map[string]string{"product_ids": strings.Join(productIDs[i:end], ","), "region": region}
		var env Envelope[[]ProductDetail]
		if err := c.call(ctx, "/echotik/product/detail", params, &env); err != nil {
			return out, err
		}
		if env.Code != 0 && env.Code != 200 {
			return out, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
		}
		out = append(out, env.Data...)
	}
	return out, nil
}

// GetProductInfluencers 取带货达人榜(page_num 必填,page_size≤10)。
func (c *Client) GetProductInfluencers(ctx context.Context, productID, region string, pageSize int) ([]ProductInfluencer, error) {
	if pageSize <= 0 || pageSize > productDetailPageCap {
		pageSize = productDetailPageCap
	}
	params := map[string]string{
		"product_id": productID,
		"region":     region,
		"page_num":   "1",
		"page_size":  strconv.Itoa(pageSize),
	}
	var env Envelope[[]ProductInfluencer]
	if err := c.call(ctx, "/echotik/product/influencer/list", params, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

// GetProductVideos 取关联带货视频(page_num 必填,page_size≤10)。
func (c *Client) GetProductVideos(ctx context.Context, productID, region string, pageSize int) ([]ProductVideo, error) {
	if pageSize <= 0 || pageSize > productDetailPageCap {
		pageSize = productDetailPageCap
	}
	params := map[string]string{
		"product_id": productID,
		"region":     region,
		"page_num":   "1",
		"page_size":  strconv.Itoa(pageSize),
	}
	var env Envelope[[]ProductVideo]
	if err := c.call(ctx, "/echotik/product/video/list", params, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

// GetProductTrend 取每日趋势。服务端单页≤10,按需翻页凑满日期区间。
// days<=0 时默认近 14 天;最多翻 6 页(60 天)兜底。
func (c *Client) GetProductTrend(ctx context.Context, productID, region string, days int) ([]ProductTrendPoint, error) {
	if days <= 0 {
		days = 14
	}
	end := time.Now().AddDate(0, 0, -1) // 服务端 T-1 数据
	start := end.AddDate(0, 0, -(days - 1))
	startStr := start.Format("2006-01-02")
	endStr := end.Format("2006-01-02")

	pages := (days + productDetailPageCap - 1) / productDetailPageCap
	if pages > 6 {
		pages = 6
	}
	var all []ProductTrendPoint
	for page := 1; page <= pages; page++ {
		params := map[string]string{
			"product_id": productID,
			"region":     region,
			"start_date": startStr,
			"end_date":   endStr,
			"page_num":   strconv.Itoa(page),
			"page_size":  strconv.Itoa(productDetailPageCap),
		}
		var env Envelope[[]ProductTrendPoint]
		if err := c.call(ctx, "/echotik/product/trend", params, &env); err != nil {
			return all, err
		}
		if env.Code != 0 && env.Code != 200 {
			return all, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
		}
		if len(env.Data) == 0 {
			break
		}
		all = append(all, env.Data...)
		if len(env.Data) < productDetailPageCap {
			break
		}
	}
	return all, nil
}
