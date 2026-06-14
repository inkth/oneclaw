package echotik

import (
	"math"
	"regexp"
	"strings"
)

// 跨境到手成本估算:落地成本 = 货价 + 物流履约。两者均为「占售价比例」的经验系数,
// 是方向性参考、不是精确报价 —— 真实成本应由用户回填(CostSource=MANUAL)或货源比价覆盖。
// 货价系数按品类细化(从品名识别,与 GuessEmoji 同机制);物流履约系数按目标市场。
// 替代旧的一刀切「售价 25%」。系数集中在本文件,便于按实际数据调参。

// CostBreakdown 落地成本拆解(分)。不含平台佣金与广告。
type CostBreakdown struct {
	GoodsCents     int     // 货价(采购)
	LogisticsCents int     // 头程 + 尾程履约
	TotalCents     int     // 合计落地成本
	Archetype      string  // 命中的成本品类
	GoodsRatio     float64 // 货价占售价比例
	LogisticsRatio float64 // 物流占售价比例
}

type costArchetype struct {
	re    *regexp.Regexp
	name  string
	ratio float64 // 货价占售价比例
}

// 货价系数表:跨境 TikTok Shop 各品类典型采购占比(经验值,可调)。靠前者优先命中。
var costArchetypes = []costArchetype{
	{regexp.MustCompile(`(?i)phone|case|charger|cable|usb|headphone|earbud|earphone|audio|speaker|electronic|gadget|camera|smartwatch|smart`), "电子数码", 0.35},
	{regexp.MustCompile(`(?i)food|drink|beverage|juic|snack|coffee|tea|supplement|vitamin|protein`), "食品保健", 0.35},
	{regexp.MustCompile(`(?i)kitchen|cook|chef|knife|pan|pot|home|clean|wash|laundry|light|lamp|led|garden|tool|storage|organizer`), "家居厨房", 0.30},
	{regexp.MustCompile(`(?i)sport|fitness|gym|yoga|camp|outdoor|tent|hiking|bike|fishing`), "运动户外", 0.32},
	{regexp.MustCompile(`(?i)pet|dog|cat|puppy|kitten`), "宠物用品", 0.30},
	{regexp.MustCompile(`(?i)baby|infant|toddler|kid|crib|toy|game|play|child`), "母婴玩具", 0.28},
	{regexp.MustCompile(`(?i)beauty|skin|makeup|cosmetic|lipstick|mask|serum|nail|hair|perfume`), "美妆个护", 0.18},
	{regexp.MustCompile(`(?i)fashion|cloth|shirt|dress|sock|pant|jacket|hoodie|underwear|lingerie|bag|backpack|shoe|sneaker|jewel|necklace|ring|earring|accessor`), "服饰配饰", 0.22},
}

const defaultGoodsRatio = 0.28

// 物流履约系数:目标市场头程 + 尾程占售价比例(轻小件经验值)。未命中走默认。
var logisticsRatioByRegion = map[string]float64{
	"US": 0.18, "CA": 0.18,
	"GB": 0.20, "IE": 0.20, "DE": 0.20, "FR": 0.20, "ES": 0.20, "IT": 0.20,
	"ID": 0.12, "TH": 0.12, "VN": 0.12, "MY": 0.12, "PH": 0.12, "SG": 0.12,
}

const defaultLogisticsRatio = 0.18

func goodsRatio(name string) (string, float64) {
	for _, a := range costArchetypes {
		if a.re.MatchString(name) {
			return a.name, a.ratio
		}
	}
	return "其他", defaultGoodsRatio
}

func logisticsRatio(region string) float64 {
	if r, ok := logisticsRatioByRegion[strings.ToUpper(strings.TrimSpace(region))]; ok {
		return r
	}
	return defaultLogisticsRatio
}

// EstimateLandedCost 按品类与目标市场估算落地成本(货价 + 物流履约)。priceCents<=0 时返回零成本拆解。
func EstimateLandedCost(priceCents int, name, region string) CostBreakdown {
	arch, gr := goodsRatio(name)
	lr := logisticsRatio(region)
	cb := CostBreakdown{Archetype: arch, GoodsRatio: gr, LogisticsRatio: lr}
	if priceCents <= 0 {
		return cb
	}
	cb.GoodsCents = int(math.Round(float64(priceCents) * gr))
	cb.LogisticsCents = int(math.Round(float64(priceCents) * lr))
	cb.TotalCents = cb.GoodsCents + cb.LogisticsCents
	return cb
}
