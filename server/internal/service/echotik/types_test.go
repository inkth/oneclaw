package echotik

import "testing"

// 达人榜行 Cum* 取值:history(累计)优先;缺失(0,搜索行没有该字段)回退 total_*。
func TestInfluencerListItemCum(t *testing.T) {
	rank := InfluencerListItem{
		TotalFollowersCnt: 1200, TotalSaleCnt: 300, TotalSaleGmvAmt: 900.5,
		TotalFollowersHistoryCnt: 5_000_000, TotalSaleHistoryCnt: 88_000, TotalSaleGmvHistoryAmt: 1_234_567.8,
	}
	if got := rank.CumFollowers(); got != 5_000_000 {
		t.Errorf("榜单行粉丝应取 history 累计,got %d", got)
	}
	if got := rank.CumSale(); got != 88_000 {
		t.Errorf("榜单行销量应取 history 累计,got %d", got)
	}
	if got := rank.CumSaleGmv(); got != 1_234_567.8 {
		t.Errorf("榜单行 GMV 应取 history 累计,got %v", got)
	}

	search := InfluencerListItem{TotalFollowersCnt: 1200, TotalSaleCnt: 300, TotalSaleGmvAmt: 900.5}
	if got := search.CumFollowers(); got != 1200 {
		t.Errorf("搜索行无 history 应回退 total_*,got %d", got)
	}
	if got := search.CumSale(); got != 300 {
		t.Errorf("搜索行无 history 应回退 total_*,got %d", got)
	}
	if got := search.CumSaleGmv(); got != 900.5 {
		t.Errorf("搜索行无 history 应回退 total_*,got %v", got)
	}
}
