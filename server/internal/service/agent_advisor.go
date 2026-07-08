package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

// ── Advisor ─────────────────────────────────────────────────────────────────
//
// 跨境顾问:面向新手的全局对话式助理 —— 答疑、结合用户情况排路线、把 4 个产出型
// Agent 能干的事变成接力建议(suggestions,前端渲染为派活 chip)。
// 免积分(引导/获客定位,同新手指南路线);多轮上下文取同会话的历史任务往来。

const (
	advisorMaxHistory  = 12  // 最多带入的历史往来条数(每条=一问一答)
	advisorHistoryClip = 600 // 单条历史产出裁剪长度(rune),防长产出(Listing/解析)撑爆上下文
)

// AdvisorSuggestion 顾问回复附带的接力建议,agent 限 4 个产出型胶囊。
type AdvisorSuggestion struct {
	Agent  string `json:"agent"`
	Prompt string `json:"prompt"`
	Label  string `json:"label,omitempty"`
}

const advisorSystem = `你是「发现猫」的跨境顾问,一个面向中国跨境电商新手的全局助理。发现猫是 TikTok Shop 带货工具,用户在这里选品、做带货短视频、写商品页、复盘投放。

你的职责:
1. 用大白话回答跨境带货的任何问题(开店、选品、物流、文案、投放、回款、术语),不确定的如实说,绝不承诺收入或销量。
2. 用户描述自己的情况(预算/货源/市场)时,给出务实的下一步行动建议,必要时排出先后顺序。
3. 平台上有 4 个 Agent 可以替用户干活,聊到对应的事就主动给接力建议:
   - ANALYST(选品分析):基于 EchoTik 真实榜单筛品
   - DIRECTOR(短视频创作):AI 生成带货短视频,也能拆解别人的爆款视频
   - LISTING(Listing 内容):商品页标题/卖点/A+ 结构/主图方案,也能做模特上身图
   - REVIEW(投放复盘):上传 GMVMax 投放报表,给停/改/加投建议
4. 开店注册、备货发货、绑收款、去广告后台投放这类平台干不了的事,在回答里给指引,不要假装能干。

背景知识(跨境带货六步,成本为美区粗略量级,给量级感不是报价):
开店入驻(保证金视类目 $0-500,资料齐 1-7 天过审;别买现成账号,关联封店货款一起冻)→ 选品(样品费 $20-100;毛利低于 35% 基本白干;别碰大牌同款等侵权品)→ 上架 Listing(别机翻,用当地人的说法写卖点)→ 做视频引流(每天 1-3 条持续发,开头 3 秒要有钩子)→ 投放放大(测试期日预算 $20-50,单次测试跑 3-7 天再下结论,ROI 2 以下一般在亏)→ 复盘迭代(每周至少一次,把成交和花费归因到单条素材)。

回答要求:
- 中文、口语化、克制篇幅:优先直接回答,不摆套话;单次回复尽量不超过 300 字,复杂问题分点。
- 结合会话里已有的往来(比如已选的品、已出的脚本、复盘结论)给建议,别让用户重复已经做过的事。
- 某个建议正好是 4 个 Agent 能干的,写进 suggestions:agent 填对应值,prompt 写一句结合用户情况、可直接发给该 Agent 的中文指令(具体、可执行),label 是按钮短文案(6 字以内,如「帮我选品」)。最多 3 条,没有就给空数组;干不了的事不要编进 suggestions。

只输出 JSON,结构:
{"reply":"给用户的回答(纯文本,可用换行分段)","suggestions":[{"agent":"ANALYST","prompt":"","label":""}]}`

type advisorOut struct {
	Reply       string              `json:"reply"`
	Suggestions []AdvisorSuggestion `json:"suggestions"`
}

// advisorThread 取当前任务所在会话的历史往来(时间正序),压成多轮消息。
// 只取已完成的任务:input 作 user 轮,产出裁剪后作 assistant 轮;
// 非顾问任务的产出带上 Agent 名前缀,让模型知道这是谁干的活。
func (s *AgentService) advisorThread(ctx context.Context, taskID uuid.UUID) []llm.Message {
	var cur model.AgentTask
	if err := s.db.WithContext(ctx).First(&cur, "id = ?", taskID).Error; err != nil || cur.ConversationID == uuid.Nil {
		return nil
	}
	var prior []model.AgentTask
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND id <> ? AND status = ? AND created_at <= ?",
			cur.ConversationID, taskID, model.TaskDone, cur.CreatedAt).
		Order("created_at DESC").
		Limit(advisorMaxHistory).
		Find(&prior).Error; err != nil {
		return nil
	}
	msgs := make([]llm.Message, 0, len(prior)*2)
	for i := len(prior) - 1; i >= 0; i-- { // 取最近 N 条后翻回时间正序
		t := prior[i]
		out := ""
		if t.Output != nil {
			out = strings.TrimSpace(*t.Output)
		}
		if out == "" {
			continue
		}
		if r := []rune(out); len(r) > advisorHistoryClip {
			out = string(r[:advisorHistoryClip]) + "…(产出已截断)"
		}
		if t.Agent != model.AgentAdvisor {
			out = fmt.Sprintf("[%s Agent 的产出]\n%s", t.Agent, out)
		}
		msgs = append(msgs,
			llm.Message{Role: "user", Content: t.Input},
			llm.Message{Role: "assistant", Content: out},
		)
	}
	return msgs
}

func (s *AgentService) runAdvisor(ctx context.Context, taskID uuid.UUID, input string) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请在服务端 .env 设置 OPENROUTER_API_KEY")
	}

	thread := append(s.advisorThread(ctx, taskID), llm.Message{Role: "user", Content: input})

	lctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	res, err := s.llm.ChatThread(lctx, "", advisorSystem, thread, true, 2000)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}

	var out advisorOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("解析顾问回复失败: %w", err)
	}
	reply := strings.TrimSpace(out.Reply)
	if reply == "" {
		return "", nil, llm.Usage{}, fmt.Errorf("顾问没给出回答,请换个说法再试")
	}

	// 接力目标白名单同新手指南(guideRelayAgents):LLM 编出别的值一律丢弃,最多 3 条。
	suggestions := make([]AdvisorSuggestion, 0, 3)
	for _, sg := range out.Suggestions {
		sg.Agent = strings.ToUpper(strings.TrimSpace(sg.Agent))
		if !guideRelayAgents[sg.Agent] || len(suggestions) >= 3 {
			continue
		}
		suggestions = append(suggestions, sg)
	}

	var meta any
	if len(suggestions) > 0 {
		meta = map[string]any{"kind": "advisor", "suggestions": suggestions}
	}
	return reply, meta, res.Usage, nil
}
