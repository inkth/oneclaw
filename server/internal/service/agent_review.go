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
	"github.com/oneclaw/server/internal/service/llm"
	"github.com/oneclaw/server/internal/service/review"
)

// reviewSystem 复盘 AI 深挖的系统设定;result.GeminiPrompt(含基线+重点素材+任务)作为 user 消息传入。
const reviewSystem = `你是一位资深的 TikTok 投放专家和数据分析师,服务跨境电商卖家。
基于用户给出的大盘基线与重点素材清单,做创意深度挖掘并产出「可执行」的优化清单。
要求:
- 全程用简体中文,直接给结论与动作,不要寒暄、不要复述题目。
- 核心产出用 Markdown 表格呈现「优化行动清单」:Video ID / Title｜当前问题｜建议操作｜优先级(P0/P1)。
- 只依据给定数据推理,数据不足处明说,不要编造数字。`

// reviewAITimeout 同步复盘里 AI 深挖的硬上限,必须 < 服务端 WriteTimeout(60s):
// 超时即降级(退额 + 仅展示本地诊断),不拖垮整个响应。
const reviewAITimeout = 45 * time.Second

// RunReview 完成一次同步复盘:AI 深挖(配额受限、best-effort)+ 落库为 DONE 的 REVIEW 任务。
// 本地四象限仪表盘(result 已算好)始终返回;AI 深挖失败/超额只降级为 warning,绝不阻断。
func (s *AgentService) RunReview(ctx context.Context, wsID uuid.UUID, input string, result *review.Result) (*model.AgentTask, error) {
	taskID := uuid.New()
	usage := s.enrichReviewAI(ctx, wsID, taskID, result)
	return s.recordReview(ctx, wsID, taskID, input, result, usage)
}

// enrichReviewAI 用 google/gemini-3.5-flash 对复盘结果做深挖,把 Markdown 结论写进 result.Analysis。
// 计费扣 1 次 AGENT_TASK;未配置 / 超额 / 调用失败均降级:退回额度、追加 warning、返回零 usage。
func (s *AgentService) enrichReviewAI(ctx context.Context, wsID, taskID uuid.UUID, result *review.Result) llm.Usage {
	if !s.llm.Configured() {
		result.Warnings = append(result.Warnings, "AI 深挖未启用(服务端未配置 OPENROUTER_API_KEY),以下为本地诊断;可复制下方提示词自行深挖。")
		return llm.Usage{}
	}
	// 配额前置:超额不报错,降级为「仅本地诊断」。
	if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageAgentTask, 1, &taskID); err != nil {
		if ae, ok := apperr.As(err); ok && ae.Code == apperr.CodeQuotaExceeded {
			result.Warnings = append(result.Warnings, "本周期积分已用完,AI 深挖已跳过;以下为本地诊断,升级方案后可重试。")
		} else {
			result.Warnings = append(result.Warnings, "AI 深挖跳过:"+err.Error())
		}
		return llm.Usage{}
	}
	// 硬超时:必须早于服务端 WriteTimeout,超时即降级而非拖垮整个响应。
	lctx, cancel := context.WithTimeout(ctx, reviewAITimeout)
	defer cancel()
	// max_tokens 给足:gemini-3.5-flash 是 reasoning 模型,推理会吃掉一部分预算,需留够正文(优化清单)。
	out, err := s.llm.ChatWithModel(lctx, s.llm.ReviewModel(), reviewSystem, result.GeminiPrompt, false, 4000)
	if err != nil {
		s.quota.Refund(ctx, taskID, model.UsageAgentTask) // 失败不烧额度
		result.Warnings = append(result.Warnings, "AI 深挖失败,仅展示本地诊断:"+err.Error())
		return llm.Usage{}
	}
	result.Analysis = strings.TrimSpace(out.Content)
	return out.Usage
}

// recordReview 把复盘结果落库为 DONE 的 REVIEW 任务,与异步 Agent 统一留痕:
// output 存摘要,metadata.review 存完整结果(含 AI 深挖)供前端还原仪表盘;usage 非空时记录真实成本。
func (s *AgentService) recordReview(ctx context.Context, wsID, taskID uuid.UUID, input string, result *review.Result, usage llm.Usage) (*model.AgentTask, error) {
	now := time.Now()
	t := model.AgentTask{
		ID:          taskID,
		WorkspaceID: wsID,
		Agent:       model.AgentReview,
		Status:      model.TaskDone,
		Input:       input,
		StartedAt:   &now,
		FinishedAt:  &now,
	}
	output := reviewSummary(result)
	t.Output = &output
	if usage.Model != "" {
		t.Model = &usage.Model
		t.TokensIn = &usage.TokensIn
		t.TokensOut = &usage.TokensOut
		t.CostCents = &usage.CostCents
	}
	if b, err := json.Marshal(map[string]any{"review": result}); err == nil {
		t.Metadata = model.JSONB(b)
	}
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		// 落库失败:已扣的 AI 深挖额度退回,避免用户白扣(handler 负责记日志)。
		if usage.Model != "" {
			s.quota.Refund(ctx, taskID, model.UsageAgentTask)
		}
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
