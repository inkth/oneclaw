package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/review"
)

// RecordReview 把一次同步复盘落库为 DONE 状态的 Agent 任务,
// 与异步 Agent 统一留痕:output 存摘要文本,metadata.review 存完整结果供前端还原仪表盘。
func (s *AgentService) RecordReview(ctx context.Context, wsID uuid.UUID, input string, result *review.Result) (*model.AgentTask, error) {
	now := time.Now()
	t := model.AgentTask{
		WorkspaceID: wsID,
		Agent:       model.AgentReview,
		Status:      model.TaskDone,
		Input:       input,
		StartedAt:   &now,
		FinishedAt:  &now,
	}

	output := reviewSummary(result)
	t.Output = &output
	if b, err := json.Marshal(map[string]any{"review": result}); err == nil {
		t.Metadata = model.JSONB(b)
	}
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "复盘记录保存失败", err)
	}
	return &t, nil
}

// reviewSummary 从复盘结果提炼一段可读摘要,作为任务 output。
func reviewSummary(r *review.Result) string {
	var b strings.Builder
	bl := r.Baseline
	fmt.Fprintf(&b, "📊 复盘完成:共 %d 条素材,总消耗 $%.0f / 总成交 $%.0f\n", bl.RowCount, bl.TotalCost, bl.TotalGmv)
	fmt.Fprintf(&b, "大盘 ROI %.2f(目标 %.1f)· 加权 CTR %.2f%% · 加权 CVR %.2f%%\n\n", bl.ROI, bl.TargetRoi, bl.AvgCtr*100, bl.AvgCvr*100)
	fmt.Fprintf(&b, "四象限:🏆 赢家 %d · 🌱 潜力 %d · 🩸 流血 %d · 🪶 长尾 %d\n",
		r.Counts[review.QuadrantWinner], r.Counts[review.QuadrantPotential],
		r.Counts[review.QuadrantBleeder], r.Counts[review.QuadrantLongtail])

	p0 := 0
	for _, a := range r.Actions {
		if a.Priority == "P0" {
			p0++
		}
	}
	if p0 > 0 {
		fmt.Fprintf(&b, "⚠️ %d 条 P0 行动建议(流血素材立即处理),详见下方仪表盘。", p0)
	} else {
		b.WriteString("无 P0 级风险,详细行动清单见下方仪表盘。")
	}
	return b.String()
}
