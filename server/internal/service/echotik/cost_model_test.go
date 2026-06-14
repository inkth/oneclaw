package echotik

import "testing"

func TestEstimateLandedCost(t *testing.T) {
	cases := []struct {
		name       string
		price      int
		prod       string
		region     string
		wantArch   string
		wantGoods  int
		wantLogi   int
		wantTotal  int
	}{
		// 美妆 0.18 货价 + US 0.18 物流。
		{"beauty-us", 2000, "Hydrating Face Serum", "US", "美妆个护", 360, 360, 720},
		// 电子 0.35 货价 + 东南亚 0.12 物流。
		{"electronics-sea", 2000, "Wireless Bluetooth Earbuds", "ID", "电子数码", 700, 240, 940},
		// 未命中品类 + 未知市场 → 默认 0.28 / 0.18。
		{"default", 2000, "Mystery Widget", "ZZ", "其他", 560, 360, 920},
		// 区域大小写/空格归一化。
		{"region-normalize", 1000, "Yoga Mat", " us ", "运动户外", 320, 180, 500},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cb := EstimateLandedCost(c.price, c.prod, c.region)
			if cb.Archetype != c.wantArch {
				t.Errorf("archetype = %q, want %q", cb.Archetype, c.wantArch)
			}
			if cb.GoodsCents != c.wantGoods || cb.LogisticsCents != c.wantLogi || cb.TotalCents != c.wantTotal {
				t.Errorf("cost = {goods:%d logi:%d total:%d}, want {goods:%d logi:%d total:%d}",
					cb.GoodsCents, cb.LogisticsCents, cb.TotalCents, c.wantGoods, c.wantLogi, c.wantTotal)
			}
		})
	}
}

// 价格非正时只返回系数、成本为零,不应 panic 或产生负值。
func TestEstimateLandedCostZeroPrice(t *testing.T) {
	cb := EstimateLandedCost(0, "anything", "US")
	if cb.TotalCents != 0 || cb.GoodsCents != 0 || cb.LogisticsCents != 0 {
		t.Errorf("zero price should yield zero cost, got %+v", cb)
	}
	if cb.GoodsRatio <= 0 || cb.LogisticsRatio <= 0 {
		t.Errorf("ratios should still be populated, got %+v", cb)
	}
}
