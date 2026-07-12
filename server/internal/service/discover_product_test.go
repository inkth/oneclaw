package service

import (
	"testing"

	"github.com/faxianmao/server/internal/model"
)

func TestDiffProductTrend(t *testing.T) {
	if got := diffProductTrend(nil); len(got) != 0 {
		t.Fatalf("空输入应返回空,得到 %d 点", len(got))
	}
	snaps := []model.DiscoverSnapshot{
		{Dt: "2026-06-18", TotalSaleCnt: 1000, TotalSaleGmv: 50000},
		{Dt: "2026-06-19", TotalSaleCnt: 1120, TotalSaleGmv: 56000}, // +120 / +6000
		{Dt: "2026-06-20", TotalSaleCnt: 1100, TotalSaleGmv: 55000}, // 口径回退 → 0 / 0
	}
	got := diffProductTrend(snaps)
	if len(got) != 3 {
		t.Fatalf("应返回 3 点,得到 %d", len(got))
	}
	if got[0].SaleCnt != 0 || got[0].GmvCents != 0 {
		t.Errorf("首点日增量应为 0: %+v", got[0])
	}
	if got[1].SaleCnt != 120 || got[1].GmvCents != 6000 {
		t.Errorf("第 2 点差分错误: %+v", got[1])
	}
	if got[2].SaleCnt != 0 || got[2].GmvCents != 0 {
		t.Errorf("口径回退应归 0,不应为负: %+v", got[2])
	}
}
