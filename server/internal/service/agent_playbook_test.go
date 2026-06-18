package service

import (
	"strings"
	"testing"

	"github.com/oneclaw/server/internal/service/review"
)

func TestBuildPlaybook(t *testing.T) {
	if buildPlaybook(review.Result{}) != "" {
		t.Error("RowCount=0 应返回空 playbook")
	}

	view2s := 0.42
	r := review.Result{
		Baseline: review.Baseline{
			RowCount: 24, ROI: 2.10, TargetRoi: 3.0,
			AvgCtr: 0.012, AvgCvr: 0.030, AvgView2s: &view2s,
		},
		Quadrants: map[review.Quadrant][]review.QuadrantItem{
			review.QuadrantWinner: {
				{Title: "Stop scrolling if your back hurts", ROI: 5.2, CTR: 0.04, CVR: 0.05},
				{Title: "12345", VideoID: "12345", ROI: 4.8, CTR: 0.03, CVR: 0.04}, // 纯数字 ID → 标题过滤
				{Title: "POV: you finally fixed your posture", ROI: 4.1, CTR: 0.035, CVR: 0.045},
			},
			review.QuadrantBleeder: {
				{Title: "boring demo", ROI: 0.5, CTR: 0.008, CVR: 0.02},
			},
		},
	}
	pb := buildPlaybook(r)
	if !strings.Contains(pb, "本店投放经验(最近复盘,24 条素材)") {
		t.Errorf("缺大盘头: %s", pb)
	}
	if !strings.Contains(pb, "ROI 2.10(目标 3.00)") {
		t.Errorf("缺基线: %s", pb)
	}
	if !strings.Contains(pb, "2s 完播 42%") {
		t.Errorf("缺 2s 完播: %s", pb)
	}
	// winner 均 CTR 0.035 vs bleeder 0.008(gap .027)>= CVR gap(.045-.02=.025)→ 钩子
	if !strings.Contains(pb, "钩子") {
		t.Errorf("应判钩子短板: %s", pb)
	}
	if !strings.Contains(pb, "Stop scrolling if your back hurts") {
		t.Errorf("缺赢家标题: %s", pb)
	}
	if strings.Contains(pb, "12345") {
		t.Errorf("纯数字 ID 应被过滤: %s", pb)
	}
}

func TestCreativeLever(t *testing.T) {
	mk := func(ctr, cvr float64) review.QuadrantItem { return review.QuadrantItem{CTR: ctr, CVR: cvr} }
	// CTR 相近、CVR 差距大 → 转化
	r := review.Result{Quadrants: map[review.Quadrant][]review.QuadrantItem{
		review.QuadrantWinner:  {mk(0.02, 0.06)},
		review.QuadrantBleeder: {mk(0.018, 0.01)},
	}}
	if lever := creativeLever(r); !strings.Contains(lever, "转化") {
		t.Errorf("应判转化短板,得: %s", lever)
	}
	// 缺 bleeder 象限 → 空
	r2 := review.Result{Quadrants: map[review.Quadrant][]review.QuadrantItem{
		review.QuadrantWinner: {mk(0.02, 0.06)},
	}}
	if creativeLever(r2) != "" {
		t.Error("缺 bleeder 象限应返回空")
	}
}

func TestIsNumericID(t *testing.T) {
	cases := map[string]bool{
		"12345":          true,
		"001-2_3":        true,
		"  99 ":          true,
		"Stop scrolling": false,
		"POV你好":          false,
		"ad_001":         false,
	}
	for in, want := range cases {
		if got := isNumericID(in); got != want {
			t.Errorf("isNumericID(%q)=%v want %v", in, got, want)
		}
	}
}
