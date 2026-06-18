package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/review"
)

// 复盘闭环:把本店最近一次 GMVMax 复盘蒸馏成「本店投放经验」,注入 DIRECTOR 写脚本上下文。
// 纯数据驱动(漏斗短板 + 自家赢家角度),零 LLM、零新表。best-effort:无复盘/解析失败返回空串。

// workspacePlaybook 取该 workspace 最近一次复盘,蒸馏成投放经验块;无则空串。
func (s *AgentService) workspacePlaybook(ctx context.Context, wsID uuid.UUID) string {
	var t model.AgentTask
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND agent = ? AND status = ?", wsID, model.AgentReview, model.TaskDone).
		Order("created_at DESC").First(&t).Error; err != nil {
		return ""
	}
	if len(t.Metadata) == 0 {
		return ""
	}
	var meta struct {
		Review review.Result `json:"review"`
	}
	if json.Unmarshal(t.Metadata, &meta) != nil {
		return ""
	}
	return buildPlaybook(meta.Review)
}

// buildPlaybook 把复盘结果拼成「本店投放经验」块。纯函数,可单测。RowCount=0 返回空。
func buildPlaybook(r review.Result) string {
	b := r.Baseline
	if b.RowCount == 0 {
		return ""
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "本店投放经验(最近复盘,%d 条素材):\n", b.RowCount)
	fmt.Fprintf(&sb, "大盘 ROI %.2f(目标 %.2f)· CTR %.1f%% · CVR %.1f%%",
		b.ROI, b.TargetRoi, b.AvgCtr*100, b.AvgCvr*100)
	if b.AvgView2s != nil {
		fmt.Fprintf(&sb, " · 2s 完播 %.0f%%", *b.AvgView2s*100)
	}
	sb.WriteString("\n")
	if lever := creativeLever(r); lever != "" {
		sb.WriteString(lever + "\n")
	}
	if wins := winnerTitles(r, 3); len(wins) > 0 {
		sb.WriteString("你跑赢的素材角度参考:")
		for i, w := range wins {
			if i > 0 {
				sb.WriteString("、")
			}
			fmt.Fprintf(&sb, "「%s」", w)
		}
		sb.WriteString("(贴近这些角度)")
	}
	return strings.TrimSpace(sb.String())
}

// creativeLever 比较 winner vs bleeder 的 CTR/CVR,差距更大的那个就是该补的创意短板。
// 任一象限为空或无正向差距时返回空串。
func creativeLever(r review.Result) string {
	winners := r.Quadrants[review.QuadrantWinner]
	bleeders := r.Quadrants[review.QuadrantBleeder]
	if len(winners) == 0 || len(bleeders) == 0 {
		return ""
	}
	wCtr, wCvr := avgCtrCvr(winners)
	bCtr, bCvr := avgCtrCvr(bleeders)
	ctrGap, cvrGap := wCtr-bCtr, wCvr-bCvr
	if ctrGap <= 0 && cvrGap <= 0 {
		return ""
	}
	if ctrGap >= cvrGap {
		return "→ 赢家主要赢在「点击率(钩子)」:脚本前 2 秒要更强的痛点/反差钩子,先把人留住。"
	}
	return "→ 赢家主要赢在「转化率」:脚本中段强化卖点证明、结尾给明确 CTA。"
}

// avgCtrCvr 求一组素材的平均 CTR、CVR。
func avgCtrCvr(items []review.QuadrantItem) (ctr, cvr float64) {
	if len(items) == 0 {
		return 0, 0
	}
	for _, it := range items {
		ctr += it.CTR
		cvr += it.CVR
	}
	n := float64(len(items))
	return ctr / n, cvr / n
}

// winnerTitles 取 winner 象限前 n 条「有钩子价值」的标题(过滤空/等于 videoId/纯数字 ID/过短)。
func winnerTitles(r review.Result, n int) []string {
	var out []string
	for _, it := range r.Quadrants[review.QuadrantWinner] {
		t := strings.TrimSpace(it.Title)
		if t == "" || t == strings.TrimSpace(it.VideoID) || len([]rune(t)) < 4 || isNumericID(t) {
			continue
		}
		out = append(out, firstN(t, 40))
		if len(out) >= n {
			break
		}
	}
	return out
}

// isNumericID 判断标题是否只是个 ID(数字/下划线/连字符/空格),无创意信息。
func isNumericID(s string) bool {
	for _, r := range s {
		if (r < '0' || r > '9') && r != '_' && r != '-' && r != ' ' {
			return false
		}
	}
	return true
}
