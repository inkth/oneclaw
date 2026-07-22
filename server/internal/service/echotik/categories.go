package echotik

import (
	"context"
	"fmt"
)

// CategoryLanguages EchoTik 类目接口认的全部语言码(传其它值上游 500)。
var CategoryLanguages = []string{"zh-CN", "en-US", "id-ID", "th-TH", "ms-MY", "vi-VN"}

// GetCategoriesL1 拉一级类目。language 必填(上游校验),给 CategoryLanguages 之一。
// 未配置凭证时由调用方走 FallbackCategoriesL1。
func (c *Client) GetCategoriesL1(ctx context.Context, region, language string) ([]Category, error) {
	params := map[string]string{"language": language, "region": region}
	var env Envelope[[]Category]
	if err := c.call(ctx, "/echotik/category/l1", params, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

// GetCategoryChildren 拉二级/三级类目(level=2|3)。parent_id 过滤父级(上级任意层 id),
// language 必填。响应行带 parent_id/category_level,与 l1 同结构。
// 该接口无静态兜底:未配置凭证或上游失败时调用方返回空,前端不渲染下级筛选行。
func (c *Client) GetCategoryChildren(ctx context.Context, level int, region, language, parentID string) ([]Category, error) {
	if level != 2 && level != 3 {
		return nil, fmt.Errorf("类目层级只有 2/3,收到 %d", level)
	}
	params := map[string]string{"language": language, "region": region, "parent_id": parentID}
	var env Envelope[[]Category]
	if err := c.call(ctx, fmt.Sprintf("/echotik/category/l%d", level), params, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 && env.Code != 200 {
		return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
	}
	return env.Data, nil
}

// FallbackCategoriesL1 类目静态兜底(真实 EchoTik 一级类目 ID + 中文名,非假数据):
// 未配置凭证或类目接口临时不可用时,类目下拉/类目扫/回填仍能工作。
// 表照抄 /echotik/category/l1?language=zh-CN 的返回(2026-07 核对,各 region 一致)。
// ⚠️ id 与名字必须成对,错配会让类目筛选/回填按错的 id 去拉数据。
func FallbackCategoriesL1() []Category {
	return []Category{
		{CategoryID: "2344592", CategoryName: "票务与代金劵"},
		{CategoryID: "600001", CategoryName: "居家日用"},
		{CategoryID: "600024", CategoryName: "厨房用品"},
		{CategoryID: "600154", CategoryName: "家纺布艺"},
		{CategoryID: "600942", CategoryName: "家电"},
		{CategoryID: "601152", CategoryName: "女装与女士内衣"},
		{CategoryID: "601303", CategoryName: "穆斯林时尚"},
		{CategoryID: "601352", CategoryName: "鞋靴"},
		{CategoryID: "601450", CategoryName: "美妆个护"},
		{CategoryID: "601739", CategoryName: "手机与数码"},
		{CategoryID: "601755", CategoryName: "电脑办公"},
		{CategoryID: "602118", CategoryName: "宠物用品"},
		{CategoryID: "602284", CategoryName: "母婴用品"},
		{CategoryID: "603014", CategoryName: "运动与户外"},
		{CategoryID: "604206", CategoryName: "玩具和爱好"},
		{CategoryID: "604453", CategoryName: "家具"},
		{CategoryID: "604579", CategoryName: "五金工具"},
		{CategoryID: "604968", CategoryName: "家装建材"},
		{CategoryID: "605196", CategoryName: "汽车与摩托车"},
		{CategoryID: "605248", CategoryName: "时尚配件"},
		{CategoryID: "700437", CategoryName: "食品饮料"},
		{CategoryID: "700645", CategoryName: "保健"},
		{CategoryID: "801928", CategoryName: "图书&杂志&音频"},
		{CategoryID: "802184", CategoryName: "儿童时尚"},
		{CategoryID: "824328", CategoryName: "男装与男士内衣"},
		{CategoryID: "824584", CategoryName: "箱包"},
		{CategoryID: "834312", CategoryName: "虚拟商品"},
		{CategoryID: "856720", CategoryName: "二手"},
		{CategoryID: "951432", CategoryName: "收藏品"},
		{CategoryID: "953224", CategoryName: "珠宝与衍生品"},
	}
}
