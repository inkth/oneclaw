package service

import "testing"

// AI 自选时长夹 4-10s(按秒计费,自选上限收紧省成本);用户显式锁定走 clampDuration,仍可 4-15s。
func TestAIDuration(t *testing.T) {
	cases := []struct{ in, want int }{
		{0, 8},   // 未给值默认 8s
		{-3, 8},  // 非法值同默认
		{2, 4},   // 低于下限抬到 4
		{6, 6},   // 区间内原样
		{10, 10}, // 上限恰好
		{12, 10}, // AI 自选超上限收到 10
		{15, 10},
	}
	for _, c := range cases {
		if got := aiDuration(c.in); got != c.want {
			t.Errorf("aiDuration(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestClampDurationUserLock(t *testing.T) {
	cases := []struct{ in, want int }{
		{0, 0},   // 未指定
		{-1, 0},  // 非法当未指定
		{2, 4},   // 下限
		{12, 12}, // 用户显式锁定不受 AI 上限约束
		{15, 15},
		{20, 15}, // 上限
	}
	for _, c := range cases {
		if got := clampDuration(c.in); got != c.want {
			t.Errorf("clampDuration(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}
