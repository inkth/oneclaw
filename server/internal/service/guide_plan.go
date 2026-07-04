package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/oneclaw/server/internal/service/llm"
)

// GuidePlanStep 个性化起步路线的一步:Agent 非空表示发现猫能替用户干,
// 前端据此渲染接力按钮(带 Prompt 跳工作台派活);空表示得用户自己做。
type GuidePlanStep struct {
	Title  string `json:"title"`
	Detail string `json:"detail"`
	Agent  string `json:"agent,omitempty"`
	Prompt string `json:"prompt,omitempty"`
}

type GuidePlanResult struct {
	Summary string          `json:"summary"`
	Steps   []GuidePlanStep `json:"steps"`
}

// 接力目标只允许现有 4 个胶囊;LLM 编出别的值一律清掉,按「自己做」渲染。
var guideRelayAgents = map[string]bool{
	"ANALYST": true, "DIRECTOR": true, "LISTING": true, "REVIEW": true,
}

const guidePlanSystem = `你是「发现猫」的跨境电商起步顾问,服务对 TikTok Shop 完全不了解的中国新手卖家。
用户会描述自己的情况(预算、有没有货源、想做的市场等),你给出一条务实的起步路线。

要求:
- 3 到 6 步,按先后顺序;每步 title 是动作短语,detail 用大白话讲清做什么、大概花多少钱/多久,不许承诺收入或销量。
- 发现猫平台上有 4 个 Agent 可以替用户干活:ANALYST(选品分析,基于真实榜单筛品)、DIRECTOR(短视频创作,AI 出带货视频)、LISTING(写商品页文案和主图方案)、REVIEW(上传投放报表做复盘)。
- 某一步如果正好是这 4 件事之一,给 agent 字段填对应值,并在 prompt 字段写一句可以直接发给该 Agent 的中文指令(结合用户的情况,具体、可执行)。
- 开店注册、备货发货、绑收款、去广告后台投放这类平台干不了的事,agent 和 prompt 留空字符串,在 detail 里给指引。
- 用户预算明显不够起步(比如低于几百元人民币)时,在 summary 里如实说,并给出更稳妥的准备建议。

只输出 JSON,结构:
{"summary":"一两句总评,结合用户情况","steps":[{"title":"","detail":"","agent":"","prompt":""}]}`

// GuidePlan 新手指南的「结合你的情况排路线」:一次轻量 LLM 调用(默认文本模型,
// 生产环境 deepseek 直连可用),不扣积分、不落任务表,作认知补充与转化钩子。
func (s *AgentService) GuidePlan(ctx context.Context, goal string) (*GuidePlanResult, error) {
	if !s.llm.Configured() {
		return nil, fmt.Errorf("AI 未配置:请在服务端 .env 设置 OPENROUTER_API_KEY")
	}

	lctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	out, err := s.llm.Chat(lctx, guidePlanSystem, goal, true, 1600)
	if err != nil {
		return nil, err
	}

	var result GuidePlanResult
	if err := json.Unmarshal([]byte(llm.ExtractJSON(out.Content)), &result); err != nil {
		return nil, fmt.Errorf("路线解析失败: %w", err)
	}
	if len(result.Steps) == 0 {
		return nil, fmt.Errorf("路线为空,请换个说法再试")
	}
	if len(result.Steps) > 8 {
		result.Steps = result.Steps[:8]
	}
	for i := range result.Steps {
		st := &result.Steps[i]
		st.Agent = strings.ToUpper(strings.TrimSpace(st.Agent))
		if !guideRelayAgents[st.Agent] {
			st.Agent, st.Prompt = "", ""
		}
	}
	return &result, nil
}
