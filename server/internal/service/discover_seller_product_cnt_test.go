package service

import (
	"testing"

	"github.com/faxianmao/server/internal/model"
)

// 上游约一成店铺不返回 total_crawl_product_cnt(如 medicube US Store),此时回落
// total_product_cnt,否则「在售商品」显示 0。
func TestSellerProductCntFallsBackToTotal(t *testing.T) {
	// 有在售口径 → 用在售,不被历史值(偏大)覆盖。
	raw := model.JSONB(`{"total_crawl_product_cnt":209,"total_product_cnt":254}`)
	if _, _, _, _, _, crawl := sellerAuthority(&model.DiscoverSeller{Raw: raw}); crawl != 209 {
		t.Errorf("有 crawl 时应优先在售口径 209,得到 %d", crawl)
	}
	// 缺在售口径(medicube 实况:字段缺失)→ 回落历史在店 254。
	raw = model.JSONB(`{"total_product_cnt":254,"total_sale_cnt":6946606}`)
	if _, _, _, _, _, crawl := sellerAuthority(&model.DiscoverSeller{Raw: raw}); crawl != 254 {
		t.Errorf("缺 crawl 时应回落 254,得到 %d", crawl)
	}
	// 两个都没有 → 真 0。
	raw = model.JSONB(`{"total_sale_cnt":100}`)
	if _, _, _, _, _, crawl := sellerAuthority(&model.DiscoverSeller{Raw: raw}); crawl != 0 {
		t.Errorf("两个字段都缺应为 0,得到 %d", crawl)
	}
}

// 累计值与在售商品数各自独立判缺:medicube 的列已有累计值(sale>0)但 crawl 落成 0,
// 旧写法在 sale>0 时提前返回,永远够不到 raw 里的 254。
func TestSellerAuthorityCrawlHealsWhenTotalsPresent(t *testing.T) {
	ds := &model.DiscoverSeller{
		TotalSaleCnt:    6946606, // 列里已有累计 → 旧写法在此提前 return
		TotalGmvCents:   86775982706,
		CrawlProductCnt: 0, // 上游缺字段落成的 0
		Raw:             model.JSONB(`{"total_product_cnt":254}`),
	}
	sale, _, _, _, _, crawl := sellerAuthority(ds)
	if crawl != 254 {
		t.Errorf("累计值在列时也应补 crawl=254,得到 %d", crawl)
	}
	if sale != 6946606 {
		t.Errorf("列里的累计值不应被 raw 覆盖,得到 %d", sale)
	}
}
