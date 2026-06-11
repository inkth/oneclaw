package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

// ── Team:爆品全链路小队(选品 → 短视频 → 排期 串行接力) ─────────────────────

type teamStep struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Status string `json:"status"` // RUNNING / DONE / FAILED
}

// saveTeamSteps 把小队进度写回任务 metadata,前端轮询任务即可看到逐步推进。
func (s *AgentService) saveTeamSteps(ctx context.Context, taskID uuid.UUID, steps []teamStep) {
	if b, err := json.Marshal(map[string]any{"steps": steps}); err == nil {
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Update("metadata", model.JSONB(b))
	}
}

// runTeam 单任务内串行跑 选品分析 → 短视频创作 → 运营排期,
// 每步完成即更新 metadata.steps;中途失败保留已完成步骤,整体置 FAILED。
func (s *AgentService) runTeam(ctx context.Context, taskID, wsID uuid.UUID, input string) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请设置 OPENROUTER_API_KEY")
	}

	steps := []teamStep{
		{Key: model.AgentAnalyst, Label: "选品分析", Status: model.TaskRunning},
		{Key: model.AgentDirector, Label: "短视频创作", Status: model.TaskQueued},
		{Key: model.AgentOperator, Label: "运营排期", Status: model.TaskQueued},
	}
	s.saveTeamSteps(ctx, taskID, steps)

	var total llm.Usage
	addUsage := func(u llm.Usage) {
		if total.Model == "" {
			total.Model = u.Model
		}
		total.TokensIn += u.TokensIn
		total.TokensOut += u.TokensOut
		total.CostCents += u.CostCents
	}
	failStep := func(i int, err error) (string, any, llm.Usage, error) {
		steps[i].Status = model.TaskFailed
		s.saveTeamSteps(ctx, taskID, steps)
		return "", nil, total, fmt.Errorf("小队在「%s」一步失败: %w", steps[i].Label, err)
	}

	// Step 1:选品分析,取 ROI 最高的推荐品交给下一棒。
	aOut, aMeta, aUsage, err := s.runAnalyst(ctx, wsID, input)
	if err != nil {
		return failStep(0, err)
	}
	addUsage(aUsage)
	steps[0].Status = model.TaskDone
	steps[1].Status = model.TaskRunning
	s.saveTeamSteps(ctx, taskID, steps)

	topTitle := input
	if b, e := json.Marshal(aMeta); e == nil {
		var am struct {
			Products []struct {
				Title    string `json:"title"`
				RoiScore int    `json:"roiScore"`
			} `json:"products"`
		}
		if json.Unmarshal(b, &am) == nil {
			best := -1
			for i, p := range am.Products {
				if best < 0 || p.RoiScore > am.Products[best].RoiScore {
					best = i
				}
			}
			if best >= 0 && am.Products[best].Title != "" {
				topTitle = am.Products[best].Title
			}
		}
	}

	// Step 2:为选中爆品生成 UGC 短视频(复用 Director,自动下发视频生成)。
	dInput := fmt.Sprintf("为「%s」生成一条 UGC 风格 TikTok 带货短视频,真人开箱口播感。用户目标:%s", topTitle, input)
	dOut, dMeta, dUsage, err := s.runDirector(ctx, wsID, dInput)
	if err != nil {
		return failStep(1, err)
	}
	addUsage(dUsage)
	steps[1].Status = model.TaskDone
	steps[2].Status = model.TaskRunning
	s.saveTeamSteps(ctx, taskID, steps)

	// Step 3:围绕爆品和新视频排本周三平台日历。
	oInput := fmt.Sprintf("围绕爆品「%s」和刚生成的视频排本周发布日历。用户目标:%s", topTitle, input)
	oOut, _, oUsage, err := s.runOperator(ctx, wsID, oInput)
	if err != nil {
		return failStep(2, err)
	}
	addUsage(oUsage)
	steps[2].Status = model.TaskDone

	var b strings.Builder
	b.WriteString("🤝 全链路小队交付完成:选品 → 短视频 → 排期\n\n")
	b.WriteString("━━ ① 选品分析 ━━\n" + aOut + "\n\n")
	b.WriteString("━━ ② 短视频创作 ━━\n" + dOut + "\n\n")
	b.WriteString("━━ ③ 运营排期 ━━\n" + oOut)

	meta := map[string]any{
		"steps":      steps,
		"topProduct": topTitle,
		"analyst":    aMeta,
		"director":   dMeta,
	}
	return b.String(), meta, total, nil
}
