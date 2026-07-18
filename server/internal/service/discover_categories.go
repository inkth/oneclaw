package service

import (
	"context"
	"sort"
	"time"

	"github.com/faxianmao/server/internal/service/echotik"
)

// categoriesTTL 一级类目极稳定,长缓存:读路径基本零 EchoTik(约 7 天 miss 一次后刷新)。
const categoriesTTL = 7 * 24 * time.Hour

// CategoryOption 给前端筛选用的一级类目。
type CategoryOption struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// 一级类目展示顺序(产品指定)。不在表里的排到最后。
// 「票务与代金劵」是 EchoTik 原名(劵 非 券),照抄才能命中排序表;截图未含,放末位。
var categoryOrder = []string{
	"美妆个护", "女装与女士内衣", "保健", "时尚配件", "运动与户外",
	"手机与数码", "居家日用", "食品饮料", "汽车与摩托车", "男装与男士内衣",
	"收藏品", "玩具和爱好", "厨房用品", "家装建材", "电脑办公",
	"箱包", "鞋靴", "五金工具", "家纺布艺", "家电",
	"宠物用品", "珠宝与衍生品", "图书&杂志&音频", "母婴用品", "家具",
	"儿童时尚", "穆斯林时尚", "二手", "虚拟商品", "票务与代金劵",
}

var categoryRank = func() map[string]int {
	m := make(map[string]int, len(categoryOrder))
	for i, name := range categoryOrder {
		m[name] = i
	}
	return m
}()

// Categories 一级类目列表(按固定顺序,缓存优先)。未配置 EchoTik 凭证时返回占位类目,失败返回空。
func (s *DiscoverService) Categories(ctx context.Context, region string) []CategoryOption {
	configured := s.echo.Configured()
	key := "categories:" + region

	// 缓存命中(仅 live 模式才写缓存,所以未配置时不会命中)。
	if configured {
		var cached []CategoryOption
		if _, ok := s.cacheGetJSON(ctx, key, categoriesTTL, &cached); ok {
			return cached
		}
	}

	var raw []echotik.Category
	if !configured {
		raw = echotik.MockCategoriesL1()
	} else {
		fetched, err := s.echo.GetCategoriesL1(ctx, region)
		if err != nil {
			return []CategoryOption{}
		}
		raw = fetched
	}

	out := make([]CategoryOption, 0, len(raw))
	for _, c := range raw {
		if c.CategoryID == "" || c.CategoryID == "0" {
			continue
		}
		out = append(out, CategoryOption{ID: c.CategoryID, Name: c.CategoryName})
	}
	sort.SliceStable(out, func(i, j int) bool {
		ri, oki := categoryRank[out[i].Name]
		rj, okj := categoryRank[out[j].Name]
		if !oki {
			ri = len(categoryOrder)
		}
		if !okj {
			rj = len(categoryOrder)
		}
		if ri != rj {
			return ri < rj
		}
		return out[i].Name < out[j].Name
	})

	if configured {
		s.cacheSetJSON(ctx, key, out)
	}
	return out
}
