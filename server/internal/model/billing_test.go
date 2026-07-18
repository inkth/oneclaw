package model

import "testing"

// 各动作积分单价:出片 35/秒(qty=AI 生成秒数)、出图 6/张、派活 3;未知 kind 与 qty=0 记 0。
func TestCreditsFor(t *testing.T) {
	cases := []struct {
		kind string
		qty  int
		want int
	}{
		{UsageVideo, 1, 35},
		{UsageVideo, 8, 280}, // 默认 8s 出片
		{UsageImage, 3, 18},
		{UsageAgentTask, 2, 6},
		{UsageVideo, 0, 0},
		{"UNKNOWN", 5, 0},
	}
	for _, c := range cases {
		if got := CreditsFor(c.kind, c.qty); got != c.want {
			t.Errorf("CreditsFor(%s,%d)=%d, want %d", c.kind, c.qty, got, c.want)
		}
	}
}

// 方案月度额度;未知方案按 FREE 处理,TEAM 为 -1(不限)。
func TestPlanCredits(t *testing.T) {
	cases := []struct {
		plan string
		want int
	}{
		{PlanFree, 450},
		{PlanPro, 5600},
		{PlanTeam, -1},
		{"GARBAGE", 450},
	}
	for _, c := range cases {
		if got := PlanCredits(c.plan); got != c.want {
			t.Errorf("PlanCredits(%s)=%d, want %d", c.plan, got, c.want)
		}
	}
}

// TEAM 超基线积分→结算金额(分):¥45/千积分,整数除法。
func TestOverflowCents(t *testing.T) {
	cases := []struct {
		credits int
		want    int
	}{
		{0, 0},
		{1000, 4500},
		{30000, 135000},
		{500, 2250}, // 500*4500/1000
	}
	for _, c := range cases {
		if got := OverflowCents(c.credits); got != c.want {
			t.Errorf("OverflowCents(%d)=%d, want %d", c.credits, got, c.want)
		}
	}
}
