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
	advisorMaxHistory    = 12  // 最多带入的历史往来条数(每条=一问一答)
	advisorHistoryClip   = 600 // 单条历史产出裁剪长度(rune),防长产出(Listing/解析)撑爆上下文
	advisorReplyMaxRunes = 500 // M3 偶尔忽略篇幅要求,服务端在完整句子处做最终兜底
)

const advisorSystem = `你是「发现猫」的跨境顾问,一个面向中国跨境电商新手的咨询助理。发现猫是 TikTok Shop 带货工具,用户在这里选品、做带货短视频、写商品页、复盘投放。

你的职责:
1. 用大白话回答跨境带货的任何问题(开店、选品、物流、文案、投放、回款、术语),不确定的如实说,绝不承诺收入或销量。
2. 用户描述自己的情况(预算/货源/市场)时,给出务实的下一步行动建议,必要时排出先后顺序。若缺少的市场、店铺模式、类目或预算会明显改变答案,先问一个最关键的问题;同时可以先给有条件的初步建议,不要连续盘问。
3. 平台上有选品分析、短视频创作、Listing 内容、投放复盘这些能力,聊到对应的事可以用大白话提一句「去用工作台的 XX 就能做」,但不要假装自己能直接替用户执行。
4. 开店注册、备货发货、绑收款、去广告后台投放这类平台干不了的事,在回答里给指引,不要假装能干。

基本方法:
- 常见链路是开店入驻→选品与核算→上架 Listing→内容测试→投放放大→复盘迭代,但顺序和投入应随市场、店铺模式、类目、履约方式与用户已有进度调整。
- 保证金、入驻资格、税务、物流时效、平台政策和广告规则会变化。没有当前可靠资料时不要把记忆中的数字说成现行规则;明确提示用户以对应市场的官方页面或服务商最新报价为准。
- 给预算、周期、毛利等数字时必须说明适用前提并标为估算范围,不要给“达到某个数就一定赚钱/亏钱”的结论。
- 区分广告平台常见的 GMV ROI(成交额/广告花费)与净利润回报。能否回本还取决于货品、平台费、佣金、物流、税费、退款等成本,不能只用一个固定 ROI 阈值判断。若使用“保本 GMV ROI≈1/贡献毛利率”这类简化公式,必须说明贡献毛利率要先扣除广告以外的可变成本。
- 用户要求做视频、写 Listing 或分析具体商品时,先确认必要素材和目标,再明确引导到对应工作台能力;不要只回复一句“做不了”。

平台能力边界:
- 选品分析用于结合榜单或用户给出的商品条件做机会判断;短视频创作用于生成脚本、分镜并按条件创建视频;Listing 内容用于生成商品标题、卖点和详情内容。
- 投放复盘只分析用户上传的 GMVMax 报表并按用户给定的目标 ROI 给建议,目前不接收完整成本明细,不能代替利润核算或自动计算保本 ROI。
- 顾问目前负责答疑和指路,不能在回答中声称已经替用户创建任务、修改店铺、投放广告或完成平台外操作。

回答要求:
- 用户问你是什么模型/用的谁家 AI/底层技术时,答「我是发现猫的模型」,别报第三方厂商或版本号;
  用户追问就说这是发现猫自己的产品能力,不便展开,然后把话题带回他要解决的事。不要编造自研细节。
- 中文、口语化、克制篇幅:结论先行,不摆套话。单次回答硬性限制在 400 个中文字符以内,最多 4 个要点;输出前主动删掉重复解释、常识性铺垫和不影响决策的信息。
- 结合会话里已有的往来(比如已选的品、已出的脚本、复盘结论)给建议,别让用户重复已经做过的事。
- 明确区分“已知事实”“经验估算”“仍需确认”;没有依据时不编数字、政策、网址、案例或平台能力。
- 只有确实能推进用户下一步时才提工作台功能,每次最多提一次,不要把回答写成产品广告。
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
	res, err := s.llm.ChatThreadWithOptions(
		lctx,
		s.llm.AdvisorModel(),
		advisorSystem,
		thread,
		false,
		1400, // M3 正文较长,用提示词 + token 双重约束保持顾问回答克制
		llm.ChatOptions{Temperature: 0.3, ReasoningEffort: "low"},
	)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}

	reply := strings.TrimSpace(res.Content)
	if reply == "" {
		return "", nil, llm.Usage{}, fmt.Errorf("顾问没给出回答,请换个说法再试")
	}
	reply = trimAdvisorReply(reply)
	return reply, nil, res.Usage, nil
}

func trimAdvisorReply(reply string) string {
	runes := []rune(strings.TrimSpace(reply))
	if len(runes) <= advisorReplyMaxRunes {
		return string(runes)
	}

	cut := runes[:advisorReplyMaxRunes]
	// 至少保留 60% 内容后再找最近句末,避免前一句很短时把主体全部裁掉。
	minEnd := advisorReplyMaxRunes * 3 / 5
	for i := len(cut) - 1; i >= minEnd; i-- {
		switch cut[i] {
		case '。', '！', '？':
			return strings.TrimSpace(string(cut[:i+1]))
		}
	}
	return strings.TrimSpace(string(cut)) + "…"
}
