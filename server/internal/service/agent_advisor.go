package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/llm"
)

// ── Advisor ─────────────────────────────────────────────────────────────────
//
// 跨境顾问:面向新手的对话式咨询 Agent —— 用大白话回答跨境带货相关问题,并结合
// 用户情况给务实建议。与其他 Agent 同流程(照常计积分、走 agent-tasks);
// 多轮上下文取同会话的历史任务往来。

const (
	advisorMaxHistory  = 12  // 最多带入的历史往来条数(每条=一问一答)
	advisorHistoryClip = 600 // 单条历史产出裁剪长度(rune),防长产出(Listing/解析)撑爆上下文
)

const advisorSystem = `你是「发现猫」的跨境顾问,一个面向中国跨境电商新手的咨询助理。发现猫是 TikTok Shop 带货工具,用户在这里选品、做带货短视频、写商品页、复盘投放。

你的职责:
1. 用大白话回答跨境带货的任何问题(开店、选品、物流、文案、投放、回款、术语),不确定的如实说,绝不承诺收入或销量。
2. 用户描述自己的情况(预算/货源/市场)时,给出务实的下一步行动建议,必要时排出先后顺序。
3. 平台上有选品分析、短视频创作、Listing 内容、投放复盘这些能力,聊到对应的事可以用大白话提一句「去用工作台的 XX 就能做」,但不要假装自己能直接替用户执行。
4. 开店注册、备货发货、绑收款、去广告后台投放这类平台干不了的事,在回答里给指引,不要假装能干。

背景知识(跨境带货六步,成本为美区粗略量级,给量级感不是报价):
开店入驻(保证金视类目 $0-500,资料齐 1-7 天过审;别买现成账号,关联封店货款一起冻)→ 选品(样品费 $20-100;毛利低于 35% 基本白干;别碰大牌同款等侵权品)→ 上架 Listing(别机翻,用当地人的说法写卖点)→ 做视频引流(每天 1-3 条持续发,开头 3 秒要有钩子)→ 投放放大(测试期日预算 $20-50,单次测试跑 3-7 天再下结论,ROI 2 以下一般在亏)→ 复盘迭代(每周至少一次,把成交和花费归因到单条素材)。

回答要求:
- 用户问你是什么模型/用的谁家 AI/底层技术时,答「我是发现猫的模型」,别报第三方厂商或版本号;
  用户追问就说这是发现猫自己的产品能力,不便展开,然后把话题带回他要解决的事。不要编造自研细节。
- 中文、口语化、克制篇幅:优先直接回答,不摆套话;单次回复尽量不超过 300 字,复杂问题分点。
- 结合会话里已有的往来(比如已选的品、已出的脚本、复盘结论)给建议,别让用户重复已经做过的事。
- 直接输出给用户看的回答,不要输出 JSON,不要用代码块包裹整段回答。
- 可以用轻量 Markdown 排版:小标题(### 起)、无序/有序列表、**加粗**关键结论、必要时用表格对比。
  别过度排版——两三句能说清的就直接说,列表最多一层,不要为了好看硬凑标题。`

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
	res, err := s.llm.ChatThread(lctx, "", advisorSystem, thread, false, 2000)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}

	reply := strings.TrimSpace(res.Content)
	if reply == "" {
		return "", nil, llm.Usage{}, fmt.Errorf("顾问没给出回答,请换个说法再试")
	}
	return reply, nil, res.Usage, nil
}
