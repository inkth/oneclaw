package review

import (
	"fmt"
	"sort"
	"strings"
)

const (
	defaultTargetRoi  = 3.0
	samplePerQuadrant = 6 // 每象限返回的代表样本数
)

func median(nums []float64) float64 {
	if len(nums) == 0 {
		return 0
	}
	s := make([]float64, len(nums))
	copy(s, nums)
	sort.Float64s(s)
	mid := len(s) / 2
	if len(s)%2 == 1 {
		return s[mid]
	}
	return (s[mid-1] + s[mid]) / 2
}

func computeBaseline(rows []MetricRow, targetRoi float64) Baseline {
	var totalCost, totalGmv, totalImpr, totalClicks, totalOrders float64
	var view2sVals []float64
	var costVals []float64
	for _, r := range rows {
		totalCost += r.Cost
		totalGmv += r.GMV
		totalImpr += r.Impressions
		totalClicks += r.Clicks
		totalOrders += r.Orders
		if r.View2s != nil && *r.View2s > 0 {
			view2sVals = append(view2sVals, *r.View2s)
		}
		if r.Cost > 0 {
			costVals = append(costVals, r.Cost)
		}
	}

	b := Baseline{
		RowCount:      len(rows),
		TotalCost:     totalCost,
		TotalGmv:      totalGmv,
		TargetRoi:     targetRoi,
		CostThreshold: median(costVals),
	}
	if totalCost > 0 {
		b.ROI = totalGmv / totalCost
	}
	if totalImpr > 0 {
		b.AvgCtr = totalClicks / totalImpr
	}
	if totalClicks > 0 {
		b.AvgCvr = totalOrders / totalClicks
	}
	if len(view2sVals) > 0 {
		var sum float64
		for _, v := range view2sVals {
			sum += v
		}
		avg := sum / float64(len(view2sVals))
		b.AvgView2s = &avg
	}
	return b
}

func classify(r MetricRow, b Baseline) Quadrant {
	highCost := r.Cost >= b.CostThreshold && r.Cost > 0
	highRoi := r.ROI >= b.TargetRoi
	switch {
	case highCost && highRoi:
		return QuadrantWinner
	case !highCost && highRoi:
		return QuadrantPotential
	case highCost && !highRoi:
		return QuadrantBleeder
	default:
		return QuadrantLongtail
	}
}

// diagnose 漏斗诊断:对一条素材给出「问题 + 操作 + 优先级」。
func diagnose(r MetricRow, b Baseline, q Quadrant) (problem, action, priority string) {
	ctrLow := r.CTR < b.AvgCtr
	cvrLow := r.CVR < b.AvgCvr

	switch q {
	case QuadrantBleeder:
		// 高消耗低 ROI —— 第一优先级
		if r.Orders == 0 {
			// 有消耗无转化
			view2sLow := r.View2s != nil && b.AvgView2s != nil && *r.View2s < *b.AvgView2s
			if r.CTR >= b.AvgCtr && view2sLow {
				return "有消耗无转化 · 高点击低完播(疑似标题党)",
					"立即关停;重做创意让内容与产品强相关", "P0"
			}
			return "有消耗无转化 · 流量正常但转化断裂",
				"立即关停;排查落地页加载速度与首图", "P0"
		}
		// 有转化但 ROI 低(CPA 过高)
		if ctrLow && !cvrLow {
			return "高耗低效 · 素材吸引力不足(CTR 低)",
				"关停或降权;打磨前 3 秒钩子提升 CTR", "P0"
		}
		if !ctrLow && cvrLow {
			return "高耗低效 · 转化环节弱(CVR 低)",
				"关停或降权;优化落地页/价格/促销/评价", "P0"
		}
		if ctrLow && cvrLow {
			return "高耗低效 · 全链路问题(CTR、CVR 双低)",
				"立即关停;先换素材再优化落地页", "P0"
		}
		return "高耗低效 · ROI 未达标",
			"降权观察;预算转给潜力/明星素材", "P0"

	case QuadrantPotential:
		return "低耗高 ROI · 被系统忽视的遗珠",
			"复制计划单独放量测试,给足探索预算", "P1"

	case QuadrantLongtail:
		// 消耗慢、量起不来 —— 素材竞争力弱
		if r.CTR > 0 && r.CTR < b.AvgCtr*0.5 {
			return "起量慢 · CTR 显著低于基准(素材竞争力弱)",
				"重剪前 2 秒钩子,套用 Trending Audio;或小幅放宽 ROI 目标", "P1"
		}
		return "长尾 · 样本太小无统计意义",
			"暂时忽略,必要时并入新一轮测试", "P2"

	default: // winner
		return "明星素材 · 高耗高 ROI",
			"交给系统自动跑或手动加推扩量,盯紧 ROI 衰减", "P2"
	}
}

func toItem(r MetricRow, q Quadrant) QuadrantItem {
	return QuadrantItem{
		VideoID:  r.VideoID,
		Title:    r.Title,
		Creator:  r.Creator,
		Cost:     r.Cost,
		GMV:      r.GMV,
		ROI:      r.ROI,
		CTR:      r.CTR,
		CVR:      r.CVR,
		Orders:   r.Orders,
		Quadrant: q,
	}
}

var priorityRank = map[string]int{"P0": 0, "P1": 1, "P2": 2}

// buildGeminiPrompt 生成可直接粘进 Gemini 的提示词,注入真实基线与重点素材清单。
func buildGeminiPrompt(b Baseline, bleeders, potentials []QuadrantItem) string {
	pct := func(n float64) string { return fmt.Sprintf("%.2f%%", n*100) }
	list := func(items []QuadrantItem) string {
		if len(items) == 0 {
			return "  (无)"
		}
		n := len(items)
		if n > 10 {
			n = 10
		}
		lines := make([]string, 0, n)
		for _, i := range items[:n] {
			who := ""
			if i.Creator != "" {
				who = " @" + strings.TrimLeft(i.Creator, "@")
			}
			lines = append(lines, fmt.Sprintf("  · %s%s(ROI %.2f, CTR %s, CVR %s)", i.VideoID, who, i.ROI, pct(i.CTR), pct(i.CVR)))
		}
		return strings.Join(lines, "\n")
	}

	view2s := ""
	if b.AvgView2s != nil {
		view2s = " ｜ 平均 2s 完播:" + pct(*b.AvgView2s)
	}

	return fmt.Sprintf(`角色设定:你是一位资深的 TikTok 投放专家和数据分析师。
任务:我已对 GMVMax 报表做了初步复盘,请基于以下基线与重点素材清单,做创意深度挖掘并产出可执行的优化清单,必要时用 Python 复核计算,不要凭空猜测。

【大盘基线】
· 视频数:%d
· 大盘 ROI:%.2f(目标 %.1f)
· 平均 CTR:%s ｜ 平均 CVR:%s%s
· 总消耗:%.0f ｜ 总 GMV:%.0f

【浪费素材(高消耗·低 ROI,需重点处理)】
%s

【潜力素材(低消耗·高 ROI,建议放量)】
%s

请完成:
1. 创意深度挖掘:对比高/低 ROI 视频的标题关键词与前 6 秒留存,找出共性钩子。
2. 漏斗归因:对每条浪费素材判断是「高 CTR 低 CVR(标题党/产品不匹配)」还是「低 CTR 高 CVR(前 3 秒不够吸引)」。
3. 达人分析:哪个达人平均 ROI 最高?哪个靠低价换量?
4. 输出一份 Markdown 表格「优化行动清单」:Video ID / Title ｜ 当前问题 ｜ 建议操作 ｜ 优先级(P0/P1)。

(多模态进阶)我可再上传高、低 ROI 各一条视频文件,请从视觉层面分析:高 ROI 做对了什么?低 ROI 前 3 秒为何流失?`,
		b.RowCount, b.ROI, b.TargetRoi, pct(b.AvgCtr), pct(b.AvgCvr), view2s, b.TotalCost, b.TotalGmv, list(bleeders), list(potentials))
}

// Analyze 复盘引擎主入口:归一化行 → 完整复盘结果。
func Analyze(rows []MetricRow, targetRoi float64, warnings []string) Result {
	if targetRoi <= 0 {
		targetRoi = defaultTargetRoi
	}
	baseline := computeBaseline(rows, targetRoi)

	counts := map[Quadrant]int{}
	buckets := map[Quadrant][]QuadrantItem{}
	for _, q := range allQuadrants {
		counts[q] = 0
		buckets[q] = []QuadrantItem{}
	}
	actions := make([]ActionItem, 0, len(rows))
	costOf := map[string]float64{}

	for _, r := range rows {
		q := classify(r, baseline)
		counts[q]++
		buckets[q] = append(buckets[q], toItem(r, q))
		problem, action, priority := diagnose(r, baseline, q)
		actions = append(actions, ActionItem{
			VideoID:  r.VideoID,
			Title:    r.Title,
			Quadrant: q,
			Problem:  problem,
			Action:   action,
			Priority: priority,
		})
		costOf[r.VideoID] = r.Cost
	}

	// 每象限按消耗降序
	for _, q := range allQuadrants {
		b := buckets[q]
		sort.SliceStable(b, func(i, j int) bool { return b[i].Cost > b[j].Cost })
		buckets[q] = b
	}

	// 行动清单:优先级 → 消耗降序
	sort.SliceStable(actions, func(i, j int) bool {
		pi, pj := priorityRank[actions[i].Priority], priorityRank[actions[j].Priority]
		if pi != pj {
			return pi < pj
		}
		return costOf[actions[i].VideoID] > costOf[actions[j].VideoID]
	})
	// 只保留需要动手的(P0/P1);若全是 P2 则回退到全量
	actionable := make([]ActionItem, 0, len(actions))
	for _, a := range actions {
		if a.Priority != "P2" {
			actionable = append(actionable, a)
		}
	}
	top := actionable
	if len(top) == 0 {
		top = actions
	}
	if len(top) > 30 {
		top = top[:30]
	}

	sample := func(items []QuadrantItem) []QuadrantItem {
		if len(items) > samplePerQuadrant {
			return items[:samplePerQuadrant]
		}
		return items
	}

	if warnings == nil {
		warnings = []string{}
	}

	return Result{
		Baseline: baseline,
		Counts:   counts,
		Quadrants: map[Quadrant][]QuadrantItem{
			QuadrantWinner:    sample(buckets[QuadrantWinner]),
			QuadrantPotential: sample(buckets[QuadrantPotential]),
			QuadrantBleeder:   sample(buckets[QuadrantBleeder]),
			QuadrantLongtail:  sample(buckets[QuadrantLongtail]),
		},
		Actions:      top,
		GeminiPrompt: buildGeminiPrompt(baseline, buckets[QuadrantBleeder], buckets[QuadrantPotential]),
		Warnings:     warnings,
	}
}
