package service

import (
	"testing"

	"github.com/oneclaw/server/internal/model"
)

func TestDiffInfluencerTrend(t *testing.T) {
	// 空输入 → 空(非 nil)
	if got := diffInfluencerTrend(nil); len(got) != 0 {
		t.Fatalf("空输入应返回空,得到 %d 点", len(got))
	}

	// 单点:无前值,日增量全 0,followers 用累计值
	one := []model.DiscoverInfluencerSnapshot{
		{Dt: "2026-06-20", Followers: 1000, SaleCnt: 50, GmvCents: 9900},
	}
	got := diffInfluencerTrend(one)
	if len(got) != 1 {
		t.Fatalf("单点应返回 1 点,得到 %d", len(got))
	}
	if got[0].Followers != 1000 || got[0].NewFollowers != 0 || got[0].SaleCnt != 0 || got[0].GmvCents != 0 {
		t.Errorf("首点日增量应为 0、followers 用累计: %+v", got[0])
	}

	// 多点:逐日差分得日增量,followers 保留累计
	multi := []model.DiscoverInfluencerSnapshot{
		{Dt: "2026-06-18", Followers: 1000, SaleCnt: 100, GmvCents: 10000},
		{Dt: "2026-06-19", Followers: 1200, SaleCnt: 150, GmvCents: 16000}, // +200 / +50 / +6000
		{Dt: "2026-06-20", Followers: 1500, SaleCnt: 220, GmvCents: 25000}, // +300 / +70 / +9000
	}
	got = diffInfluencerTrend(multi)
	if len(got) != 3 {
		t.Fatalf("应返回 3 点,得到 %d", len(got))
	}
	if got[1].Followers != 1200 || got[1].NewFollowers != 200 || got[1].SaleCnt != 50 || got[1].GmvCents != 6000 {
		t.Errorf("第 2 点差分错误: %+v", got[1])
	}
	if got[2].Followers != 1500 || got[2].NewFollowers != 300 || got[2].SaleCnt != 70 || got[2].GmvCents != 9000 {
		t.Errorf("第 3 点差分错误: %+v", got[2])
	}

	// 口径回退(后一天累计 < 前一天)→ 日增量归 0,不出现负数;followers 仍保留累计
	regress := []model.DiscoverInfluencerSnapshot{
		{Dt: "2026-06-19", Followers: 2000, SaleCnt: 300, GmvCents: 30000},
		{Dt: "2026-06-20", Followers: 1800, SaleCnt: 280, GmvCents: 28000},
	}
	got = diffInfluencerTrend(regress)
	if got[1].NewFollowers != 0 || got[1].SaleCnt != 0 || got[1].GmvCents != 0 {
		t.Errorf("口径回退应归 0,不应为负: %+v", got[1])
	}
	if got[1].Followers != 1800 {
		t.Errorf("followers 应保留累计值 1800,得到 %d", got[1].Followers)
	}
}
