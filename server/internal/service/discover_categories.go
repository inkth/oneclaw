package service

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/faxianmao/server/internal/logger"
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
		raw = echotik.FallbackCategoriesL1()
	} else {
		fetched, err := s.echo.GetCategoriesL1(ctx, region, "zh-CN")
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

// CategoryChildren 二级/三级类目筛选项(level=子级层级 2|3,parentID=上一级类目 id)。
// 与 L1 同节奏 7 天缓存;无静态兜底:未配置凭证/上游失败返回空,前端只降级隐藏下级行,
// 一级筛选不受影响。
func (s *DiscoverService) CategoryChildren(ctx context.Context, region, parentID string, level int) []CategoryOption {
	if parentID == "" || (level != 2 && level != 3) || !s.echo.Configured() {
		return []CategoryOption{}
	}
	key := fmt.Sprintf("categories:l%d:%s:%s", level, region, parentID)
	var cached []CategoryOption
	if _, ok := s.cacheGetJSON(ctx, key, categoriesTTL, &cached); ok {
		return cached
	}

	raw, err := s.echo.GetCategoryChildren(ctx, level, region, "zh-CN", parentID)
	if err != nil {
		logger.Warn("拉取子类目失败", logger.Int("level", level), logger.String("parent", parentID), logger.Err(err))
		return []CategoryOption{}
	}
	out := make([]CategoryOption, 0, len(raw))
	for _, c := range raw {
		if c.CategoryID == "" || c.CategoryID == "0" {
			continue
		}
		// 防御:上游若忽略 parent_id 参数回了全量,按行内 parent_id 本地过滤。
		if c.ParentID != "" && c.ParentID != parentID {
			continue
		}
		out = append(out, CategoryOption{ID: c.CategoryID, Name: c.CategoryName})
	}
	// 空结果不写缓存:上游偶发抖动不该被钉死 7 天。
	if len(out) > 0 {
		s.cacheSetJSON(ctx, key, out)
	}
	return out
}
