package service

import (
	"testing"
	"time"

	"github.com/faxianmao/server/internal/model"
)

func ymd(t time.Time) string { return t.In(cnZone).Format("2006-01-02") }

// 订阅周期窗口:锚点日 + 月末 clamp + 年边界 + 闰年。
func TestCycleBounds(t *testing.T) {
	mk := func(y int, m time.Month, day int) time.Time {
		return time.Date(y, m, day, 0, 0, 0, 0, cnZone)
	}
	cases := []struct {
		name               string
		anchorDay          int
		now                time.Time
		wantStart, wantEnd string
	}{
		{"月中-已过锚点", 15, mk(2026, 6, 20), "2026-06-15", "2026-07-15"},
		{"月中-未到锚点", 15, mk(2026, 6, 10), "2026-05-15", "2026-06-15"},
		{"恰好锚点当天", 15, mk(2026, 6, 15), "2026-06-15", "2026-07-15"},
		{"年边界", 15, mk(2026, 1, 10), "2025-12-15", "2026-01-15"},
		{"月末clamp-2月", 31, mk(2026, 2, 10), "2026-01-31", "2026-02-28"},
		{"月末clamp-3月初", 31, mk(2026, 3, 5), "2026-02-28", "2026-03-31"},
		{"闰年2月", 31, mk(2024, 2, 10), "2024-01-31", "2024-02-29"},
		{"30号锚点-2月", 30, mk(2026, 2, 15), "2026-01-30", "2026-02-28"},
	}
	for _, c := range cases {
		anchor := mk(2020, 1, c.anchorDay) // 仅取 day,年月无关紧要
		start, end := cycleBounds(anchor, c.now)
		if ymd(start) != c.wantStart || ymd(end) != c.wantEnd {
			t.Errorf("%s: got [%s,%s), want [%s,%s)", c.name, ymd(start), ymd(end), c.wantStart, c.wantEnd)
		}
		// 周期半开、首尾相接:now 必落在 [start,end) 内。
		if c.now.Before(start) || !c.now.Before(end) {
			t.Errorf("%s: now %s 不在 [%s,%s)", c.name, ymd(c.now), ymd(start), ymd(end))
		}
	}
}

// 相邻周期首尾相接,无缝无叠(月末 clamp 也成立)。
func TestCycleBoundsContiguous(t *testing.T) {
	anchor := time.Date(2020, 1, 31, 0, 0, 0, 0, cnZone) // 锚点 31 号
	probe := time.Date(2026, 1, 5, 12, 0, 0, 0, cnZone)
	for i := 0; i < 14; i++ {
		_, end := cycleBounds(anchor, probe)
		// 下一周期起点 == 本周期终点
		_, nextEnd := cycleBounds(anchor, end)
		nextStart, _ := cycleBounds(anchor, end.Add(time.Hour))
		if !nextStart.Equal(end) {
			t.Fatalf("周期不相接: 本周期 end=%s, 下周期 start=%s", ymd(end), ymd(nextStart))
		}
		if !nextEnd.After(end) {
			t.Fatalf("周期未推进: end=%s nextEnd=%s", ymd(end), ymd(nextEnd))
		}
		probe = end.Add(24 * time.Hour) // 推进到下一周期内
	}
}

// 锚点选取:付费档用付费日;FREE / 无锚点回退注册日(含降级)。
func TestBillingAnchor(t *testing.T) {
	created := time.Date(2026, 3, 1, 0, 0, 0, 0, cnZone)
	paid := time.Date(2026, 6, 15, 0, 0, 0, 0, cnZone)
	ws := &model.Workspace{CreatedAt: created}

	if got := billingAnchor(model.PlanFree, ws); !got.Equal(created) {
		t.Errorf("FREE 应回退注册日, got %s", ymd(got))
	}
	if got := billingAnchor(model.PlanPro, ws); !got.Equal(created) {
		t.Errorf("付费但无锚点应回退注册日, got %s", ymd(got))
	}
	ws.BillingCycleAnchor = &paid
	if got := billingAnchor(model.PlanPro, ws); !got.Equal(paid) {
		t.Errorf("付费档应用付费锚点, got %s", ymd(got))
	}
	// 降级回 FREE:即便 anchor 字段还在,额度窗口仍按注册日(Q2 决策)。
	if got := billingAnchor(model.PlanFree, ws); !got.Equal(created) {
		t.Errorf("FREE 即便有锚点也回退注册日, got %s", ymd(got))
	}
}

func TestShiftMonth(t *testing.T) {
	cases := []struct {
		y     int
		m     time.Month
		delta int
		wy    int
		wm    time.Month
	}{
		{2026, time.January, -1, 2025, time.December},
		{2026, time.December, 1, 2027, time.January},
		{2026, time.June, -13, 2025, time.May},
		{2026, time.June, 12, 2027, time.June},
	}
	for _, c := range cases {
		y, m := shiftMonth(c.y, c.m, c.delta)
		if y != c.wy || m != c.wm {
			t.Errorf("shiftMonth(%d,%v,%d) = %d,%v; want %d,%v", c.y, c.m, c.delta, y, m, c.wy, c.wm)
		}
	}
}
