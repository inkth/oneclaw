package review

import "testing"

const sampleCSV = `Video ID,标题,达人,消耗,GMV,曝光,点击,订单,点击率,转化率,2秒完播率
v1,高效爆款,@alice,1000,5000,100000,3000,200,3%,6.7%,45%
v2,烧钱无转化,@bob,1200,300,80000,800,2,1%,0.25%,12%
v3,潜力遗珠,@carol,80,640,8000,300,30,3.75%,10%,50%
v4,长尾小量,@dave,50,40,2000,20,0,1%,0%,8%
`

func TestParseAndAnalyze(t *testing.T) {
	res, err := ParseReport([]byte(sampleCSV), "report.csv")
	if err != nil {
		t.Fatalf("ParseReport error: %v", err)
	}
	if len(res.Rows) != 4 {
		t.Fatalf("expected 4 rows, got %d (warnings=%v)", len(res.Rows), res.Warnings)
	}

	// 校验数值解析与百分比折算
	var v1 *MetricRow
	for i := range res.Rows {
		if res.Rows[i].VideoID == "v1" {
			v1 = &res.Rows[i]
		}
	}
	if v1 == nil {
		t.Fatal("row v1 not found")
	}
	if v1.Cost != 1000 || v1.GMV != 5000 {
		t.Errorf("v1 cost/gmv wrong: %+v", v1)
	}
	if v1.CTR < 0.029 || v1.CTR > 0.031 {
		t.Errorf("v1 ctr should be ~0.03, got %v", v1.CTR)
	}
	if v1.View2s == nil || *v1.View2s < 0.44 || *v1.View2s > 0.46 {
		t.Errorf("v1 view2s should be ~0.45, got %v", v1.View2s)
	}

	out := Analyze(res.Rows, 3.0, res.Warnings)

	// 四象限计数齐全
	total := 0
	for _, q := range allQuadrants {
		if _, ok := out.Counts[q]; !ok {
			t.Errorf("missing count for quadrant %s", q)
		}
		if out.Quadrants[q] == nil {
			t.Errorf("quadrant %s slice is nil (would marshal to null)", q)
		}
		total += out.Counts[q]
	}
	if total != 4 {
		t.Errorf("counts should sum to 4, got %d", total)
	}

	// v1 高耗(>=中位数)高 ROI(5.0>=3) → winner
	if classifyOf(out, "v1") != QuadrantWinner {
		t.Errorf("v1 should be winner, got %s", classifyOf(out, "v1"))
	}
	// v2 高耗 低 ROI(0.25) → bleeder
	if classifyOf(out, "v2") != QuadrantBleeder {
		t.Errorf("v2 should be bleeder, got %s", classifyOf(out, "v2"))
	}
	// v3 低耗 高 ROI(8.0) → potential
	if classifyOf(out, "v3") != QuadrantPotential {
		t.Errorf("v3 should be potential, got %s", classifyOf(out, "v3"))
	}

	if out.GeminiPrompt == "" {
		t.Error("geminiPrompt should not be empty")
	}
	if len(out.Actions) == 0 {
		t.Error("actions should not be empty")
	}
}

// classifyOf 在四象限样本里找某视频被归到的象限。
func classifyOf(out Result, videoID string) Quadrant {
	for _, q := range allQuadrants {
		for _, it := range out.Quadrants[q] {
			if it.VideoID == videoID {
				return q
			}
		}
	}
	return ""
}
