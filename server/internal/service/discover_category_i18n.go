package service

import (
	"context"
	"strings"
	"time"

	"github.com/faxianmao/server/internal/service/echotik"
)

// 类目中文化。EchoTik 的榜单/详情接口不认 language 参数(传了也照样返回市场本地语言),
// 所以店铺的主营类目会以英/印尼/泰/越文回来。唯一能拿到中文的是类目表接口,于是这里把
// 类目表按每个语言各拉一遍,用 category_id 对齐,自建「外文名 → 中文名」词典。
// 词典缓存 7 天(类目表极稳定),读路径基本零 EchoTik。

const categoryI18NTTL = 7 * 24 * time.Hour

// categoryZhDict 外文类目名 → 中文名,键已归一化。零值可用:未命中即回落原文。
type categoryZhDict map[string]string

// normalizeCategoryKey 归一化词典键:忽略大小写与空白差异。上游历史数据存过
// 「Điện thoại & đồ điện tử」这种只差大小写的旧写法,不归一化就命不中。
func normalizeCategoryKey(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}

// Name 单个类目名中文化;词典缺失或未命中一律回落原文,不吞数据。
func (d categoryZhDict) Name(name string) string {
	if zh, ok := d[normalizeCategoryKey(name)]; ok && zh != "" {
		return zh
	}
	return name
}

// Names 批量中文化(店铺主营类目是数组)。
func (d categoryZhDict) Names(names []string) []string {
	out := make([]string, 0, len(names))
	for _, n := range names {
		out = append(out, d.Name(n))
	}
	return out
}

// legacyCategoryZh 存量行里 EchoTik 已改名的旧写法(如印尼语 Ponsel→Telepon)。
// 类目表只返回当前名,对不上这些历史值;店铺行刷新后会自愈,这张表只是让上线当天不露外文。
// 键必须是 normalizeCategoryKey 后的形态。
var legacyCategoryZh = map[string]string{
	"ponsel & elektronik": "手机与数码",
	"ของใช้สำหรับสัตว์เลี้ยง":     "宠物用品",
	"สิ่งทอและของตกแต่งประเภทผ้า": "家纺布艺",
	"แม่และเด็ก":                  "母婴用品",
}

// categoryZh 取该 region 的类目中文词典(缓存优先)。任一语言拉失败就整轮不缓存,
// 避免把残缺词典钉住 7 天;此轮直接回落原文。
func (s *DiscoverService) categoryZh(ctx context.Context, region string) categoryZhDict {
	key := "categories:i18n:" + region

	var cached categoryZhDict
	if _, ok := s.cacheGetJSON(ctx, key, categoryI18NTTL, &cached); ok {
		return cached
	}
	if !s.echo.Configured() {
		return categoryZhDict{}
	}

	zhRaw, err := s.echo.GetCategoriesL1(ctx, region, "zh-CN")
	if err != nil {
		return categoryZhDict{}
	}
	zhByID := make(map[string]string, len(zhRaw))
	for _, c := range zhRaw {
		if c.CategoryID != "" && c.CategoryName != "" {
			zhByID[c.CategoryID] = c.CategoryName
		}
	}

	dict := categoryZhDict{}
	for k, v := range legacyCategoryZh {
		dict[k] = v
	}
	for _, lang := range echotik.CategoryLanguages {
		if lang == "zh-CN" {
			continue
		}
		raw, err := s.echo.GetCategoriesL1(ctx, region, lang)
		if err != nil {
			return categoryZhDict{}
		}
		for _, c := range raw {
			zh, ok := zhByID[c.CategoryID]
			if !ok || c.CategoryName == "" {
				continue
			}
			dict[normalizeCategoryKey(c.CategoryName)] = zh
		}
	}
	if len(dict) == 0 {
		return dict
	}
	s.cacheSetJSON(ctx, key, dict)
	return dict
}

// influencerCategoryZh 达人「内容领域」中文名。
// ⚠️ 这不是商品类目 —— 达人榜/详情的 category 是 TikTok 创作者领域标签:固定英文枚举、
// 没有 category_id、与商品类目表完全对不上,所以只能单独写死一张表(上面那套 id 对齐的
// 词典对它无效)。表外的值回落原文。
var influencerCategoryZh = map[string]string{
	"art & crafts":                 "艺术手工",
	"automotive & transportation":  "汽车交通",
	"baby":                         "母婴",
	"beauty":                       "美妆",
	"clothing & accessories":       "服饰配饰",
	"daily life":                   "日常生活",
	"education & training":         "教育培训",
	"finance & investment":         "金融理财",
	"food & beverage":              "美食饮品",
	"gaming":                       "游戏",
	"government affairs":           "政务",
	"health & wellness":            "健康养生",
	"home, furniture & appliances": "家居家电",
	"it & high-tech":               "数码科技",
	"media & entertainment":        "影视娱乐",
	"music & dance":                "音乐舞蹈",
	"news & information":           "新闻资讯",
	"ngo & charity":                "公益组织",
	"other":                        "其他",
	"personal blog":                "个人博主",
	"pets":                         "宠物",
	"public figure":                "公众人物",
	"shopping & retail":            "购物零售",
	"sports, fitness & outdoors":   "运动健身户外",
	"travel":                       "旅行",
}

// zhInfluencerCategory 达人内容领域中文化;未命中回落原文。
func zhInfluencerCategory(name string) string {
	if zh, ok := influencerCategoryZh[normalizeCategoryKey(name)]; ok {
		return zh
	}
	return name
}
