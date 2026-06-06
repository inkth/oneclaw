package echotik

import (
	"math"
	"regexp"
)

var emojiByKeyword = []struct {
	re *regexp.Regexp
	e  string
}{
	{regexp.MustCompile(`(?i)juic|drink|beverage|cup|bottle`), "🥤"},
	{regexp.MustCompile(`(?i)baby|infant|toddler|kid|crib`), "🍼"},
	{regexp.MustCompile(`(?i)pet|dog|cat`), "🐕"},
	{regexp.MustCompile(`(?i)beauty|skin|makeup|cosmetic|lipstick|mask`), "💄"},
	{regexp.MustCompile(`(?i)phone|case|charger|cable|usb`), "📱"},
	{regexp.MustCompile(`(?i)camp|outdoor|tent|hiking`), "🏕️"},
	{regexp.MustCompile(`(?i)light|lamp|led`), "💡"},
	{regexp.MustCompile(`(?i)clean|wash|laundry`), "🧼"},
	{regexp.MustCompile(`(?i)kitchen|cook|chef|knife|pan`), "🍳"},
	{regexp.MustCompile(`(?i)fashion|cloth|shirt|dress|sock`), "👕"},
	{regexp.MustCompile(`(?i)toy|game|play`), "🧸"},
	{regexp.MustCompile(`(?i)sport|fitness|gym|yoga`), "🏋️"},
	{regexp.MustCompile(`(?i)headphone|earbud|audio|speaker`), "🎧"},
	{regexp.MustCompile(`(?i)garden|plant|flower`), "🪴"},
}

// GuessEmoji 按商品名猜 emoji,默认 📦。
func GuessEmoji(name string) string {
	for _, m := range emojiByKeyword {
		if m.re.MatchString(name) {
			return m.e
		}
	}
	return "📦"
}

// DollarsToCents 美元→分(四舍五入)。
func DollarsToCents(v float64) int { return int(math.Round(v * 100)) }

// EstimateCostCents 估算采购成本:默认售价 25%。
func EstimateCostCents(priceCents int) int { return int(math.Round(float64(priceCents) * 0.25)) }

// EstimateMarginPct 估算毛利率。
func EstimateMarginPct(priceCents, costCents int) int {
	if priceCents <= 0 {
		return 0
	}
	return int(math.Round(float64(priceCents-costCents) / float64(priceCents) * 100))
}

// RoiScore 按销量 / 达人覆盖粗略加权(0-100)。
func RoiScore(totalSaleCnt, totalIflCnt int) int {
	sales := math.Min(100, math.Round(math.Log10(math.Max(1, float64(totalSaleCnt)))*22))
	ifl := math.Min(100, math.Round(math.Log10(math.Max(1, float64(totalIflCnt)))*25))
	return int(math.Round((sales + ifl) / 2))
}
