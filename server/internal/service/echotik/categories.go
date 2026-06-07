package echotik

import (
	"context"
	"fmt"
)

// GetCategoriesL1 拉一级类目(中文名)。未配置凭证时由调用方走 mock。
func (c *Client) GetCategoriesL1(ctx context.Context, region string) ([]Category, error) {
	params := map[string]string{"language": "zh-CN", "region": region}
	var env Envelope[[]Category]
	if err := c.call(ctx, "/echotik/category/l1", params, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

// MockCategoriesL1 没配凭证时的占位类目(便于 dev/preview 看 UI)。
func MockCategoriesL1() []Category {
	return []Category{
		{CategoryID: "601152", CategoryName: "美妆个护"},
		{CategoryID: "601450", CategoryName: "女装与女士内衣"},
		{CategoryID: "601352", CategoryName: "保健"},
		{CategoryID: "601739", CategoryName: "时尚配件"},
		{CategoryID: "601755", CategoryName: "运动与户外"},
		{CategoryID: "601153", CategoryName: "手机与数码"},
		{CategoryID: "601303", CategoryName: "居家日用"},
		{CategoryID: "600001", CategoryName: "食品饮料"},
		{CategoryID: "604406", CategoryName: "厨房用品"},
		{CategoryID: "604579", CategoryName: "宠物用品"},
		{CategoryID: "602284", CategoryName: "母婴用品"},
		{CategoryID: "605196", CategoryName: "玩具和爱好"},
	}
}
