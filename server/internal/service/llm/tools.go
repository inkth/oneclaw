package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/faxianmao/server/internal/logger"
)

// ── 工具调用(function calling)────────────────────────────────────────────────
//
// 单轮原语:发一次带 tools 的对话,返回「正文 或 工具调用请求」。多轮循环(执行工具、
// 回填结果、再问)由调用方(agent_scout 等)驱动 —— 工具的执行属于业务层,llm 包只管线协议。
// 2026-07-24 spike 实测 minimax-m3 / deepseek-v4-pro 均正确返回 tool_calls(含并行多调用)。

// Tool 一个可供模型调用的函数(OpenAI function-calling 形态)。
type Tool struct {
	Name        string
	Description string
	Parameters  map[string]any // JSON Schema(type=object)
}

// ToolCall 模型发起的一次函数调用。Args 是原始 JSON 串,由调用方解析。
type ToolCall struct {
	ID   string
	Name string
	Args string
}

// ThreadMsg 工具调用会话里的一条消息。比 Message 多两个字段:
// assistant 轮可带 ToolCalls(模型历史上发起过的调用);tool 轮带 ToolCallID(结果对应哪次调用)。
type ThreadMsg struct {
	Role       string // user | assistant | tool
	Content    string
	ToolCalls  []ToolCall // Role=assistant 时
	ToolCallID string     // Role=tool 时
}

// ToolRoundResult 单轮结果:ToolCalls 非空=模型要求先调工具(Content 可能带一句开场白);
// ToolCalls 为空=Content 即最终回答。
type ToolRoundResult struct {
	Content   string
	ToolCalls []ToolCall
	Usage     Usage
}

// ── 线协议 ──────────────────────────────────────────────────────────────────

type wireTool struct {
	Type     string       `json:"type"` // "function"
	Function wireToolFunc `json:"function"`
}

type wireToolFunc struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type wireToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

func toWireTools(tools []Tool) []wireTool {
	if len(tools) == 0 {
		return nil
	}
	out := make([]wireTool, 0, len(tools))
	for _, t := range tools {
		out = append(out, wireTool{Type: "function", Function: wireToolFunc{
			Name: t.Name, Description: t.Description, Parameters: t.Parameters,
		}})
	}
	return out
}

func toWireToolCalls(calls []ToolCall) []wireToolCall {
	out := make([]wireToolCall, 0, len(calls))
	for _, tc := range calls {
		w := wireToolCall{ID: tc.ID, Type: "function"}
		w.Function.Name = tc.Name
		w.Function.Arguments = tc.Args
		out = append(out, w)
	}
	return out
}

func fromWireToolCalls(calls []wireToolCall) []ToolCall {
	out := make([]ToolCall, 0, len(calls))
	for _, w := range calls {
		out = append(out, ToolCall{ID: w.ID, Name: w.Function.Name, Args: w.Function.Arguments})
	}
	return out
}

// ChatThreadTools 发一轮带工具的多轮对话。tools 为空则退化为普通对话(用于工具轮耗尽后
// 强制模型收口作答)。opts.OnDelta 非空时正文增量实时回调 —— 工具调用帧不回调,只累积。
func (c *Client) ChatThreadTools(ctx context.Context, model, system string, thread []ThreadMsg, tools []Tool, maxTokens int, opts ChatOptions) (*ToolRoundResult, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if model == "" {
		model = c.cfg.Model
	}
	if maxTokens <= 0 {
		maxTokens = 2000
	}
	temperature := opts.Temperature
	if temperature <= 0 {
		temperature = 0.7
	}

	msgs := make([]chatMsg, 0, len(thread)+1)
	msgs = append(msgs, chatMsg{Role: "system", Content: system})
	for _, m := range thread {
		cm := chatMsg{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID}
		if len(m.ToolCalls) > 0 {
			cm.ToolCalls = toWireToolCalls(m.ToolCalls)
		}
		msgs = append(msgs, cm)
	}

	streaming := opts.OnDelta != nil
	body := chatReq{
		Model:       model,
		Messages:    msgs,
		MaxTokens:   maxTokens,
		Temperature: temperature,
		Stream:      streaming,
		Tools:       toWireTools(tools),
	}
	if streaming {
		body.StreamOptions = &streamOpts{IncludeUsage: true}
	}
	if opts.ReasoningEffort != "" {
		body.Reasoning = &reasoning{Effort: opts.ReasoningEffort}
	}
	buf, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", c.cfg.Referer)
	req.Header.Set("X-Title", "Faxianmao")

	if streaming {
		req.Header.Set("Accept", "text/event-stream")
		return c.doStreamTools(req, model, maxTokens, opts.OnDelta)
	}

	res, err := c.http.Do(req)
	if err != nil {
		logger.Warn("[llm] 工具轮请求失败", logger.String("model", model), logger.Err(err))
		return nil, fmt.Errorf("llm: 请求失败: %w", err)
	}
	defer res.Body.Close()

	var parsed chatResp
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("llm: 解析响应失败: %w", err)
	}
	if parsed.Error != nil {
		logger.Warn("[llm] 工具轮上游拒绝",
			logger.String("model", model), logger.Int("http", res.StatusCode),
			logger.String("upstream", parsed.Error.Message))
		return nil, fmt.Errorf("llm: 上游错误: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("llm: 空响应(HTTP %d)", res.StatusCode)
	}
	msg := parsed.Choices[0].Message
	out := &ToolRoundResult{
		Content:   msg.Content,
		ToolCalls: fromWireToolCalls(msg.ToolCalls),
		Usage: Usage{
			Model:     model,
			TokensIn:  parsed.Usage.PromptTokens,
			TokensOut: parsed.Usage.CompletionTokens,
			CostCents: estimateCostCents(model, parsed.Usage.PromptTokens, parsed.Usage.CompletionTokens),
		},
	}
	// 正文、工具调用双空视为失败(对齐 doWithOptions 的空正文防线)。
	if strings.TrimSpace(out.Content) == "" && len(out.ToolCalls) == 0 {
		logger.Warn("[llm] 工具轮正文与调用均为空",
			logger.String("model", model), logger.Int("max_tokens", maxTokens))
		return nil, fmt.Errorf("llm: 模型返回空轮次(model=%s)", model)
	}
	return out, nil
}

// streamToolChunk 带工具调用增量的 SSE 帧。delta.tool_calls 按 index 分片:
// 同一调用的 arguments 会拆成多帧逐段到达,id/name 只在首帧出现。
type streamToolChunk struct {
	Choices []struct {
		Delta struct {
			Content   string `json:"content"`
			ToolCalls []struct {
				Index    int    `json:"index"`
				ID       string `json:"id"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			} `json:"tool_calls"`
		} `json:"delta"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// doStreamTools 读带工具调用的 SSE 流:正文增量回调 onDelta,工具调用分片按 index 累积。
func (c *Client) doStreamTools(req *http.Request, model string, maxTokens int, onDelta func(string)) (*ToolRoundResult, error) {
	res, err := c.streamHTTP.Do(req)
	if err != nil {
		logger.Warn("[llm] 工具流式请求失败", logger.String("model", model), logger.Err(err))
		return nil, fmt.Errorf("llm: 请求失败: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		var parsed chatResp
		_ = json.NewDecoder(res.Body).Decode(&parsed)
		msg := fmt.Sprintf("HTTP %d", res.StatusCode)
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		logger.Warn("[llm] 工具流式上游拒绝",
			logger.String("model", model), logger.Int("http", res.StatusCode), logger.String("upstream", msg))
		return nil, fmt.Errorf("llm: 上游错误: %s", msg)
	}

	type callAcc struct {
		id   string
		name string
		args strings.Builder
	}
	var (
		full  strings.Builder
		calls = map[int]*callAcc{}
		usage Usage
	)
	sc := bufio.NewScanner(res.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		payload, ok := strings.CutPrefix(line, "data: ")
		if !ok {
			continue
		}
		if payload == "[DONE]" {
			break
		}
		var chunk streamToolChunk
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			continue
		}
		if chunk.Error != nil {
			logger.Warn("[llm] 工具流中上游拒绝",
				logger.String("model", model), logger.String("upstream", chunk.Error.Message))
			return nil, fmt.Errorf("llm: 上游错误: %s", chunk.Error.Message)
		}
		if chunk.Usage != nil {
			usage.TokensIn, usage.TokensOut = chunk.Usage.PromptTokens, chunk.Usage.CompletionTokens
		}
		for _, ch := range chunk.Choices {
			if ch.Delta.Content != "" {
				full.WriteString(ch.Delta.Content)
				onDelta(ch.Delta.Content)
			}
			for _, tc := range ch.Delta.ToolCalls {
				acc := calls[tc.Index]
				if acc == nil {
					acc = &callAcc{}
					calls[tc.Index] = acc
				}
				if tc.ID != "" {
					acc.id = tc.ID
				}
				if tc.Function.Name != "" {
					acc.name = tc.Function.Name
				}
				acc.args.WriteString(tc.Function.Arguments)
			}
		}
	}
	if err := sc.Err(); err != nil {
		logger.Warn("[llm] 工具流中断", logger.String("model", model), logger.Err(err))
		return nil, fmt.Errorf("llm: 流中断: %w", err)
	}

	idxs := make([]int, 0, len(calls))
	for i := range calls {
		idxs = append(idxs, i)
	}
	sort.Ints(idxs)
	toolCalls := make([]ToolCall, 0, len(idxs))
	for _, i := range idxs {
		acc := calls[i]
		if acc.name == "" { // 无名分片(异常帧)丢弃,不让空调用进业务层
			continue
		}
		toolCalls = append(toolCalls, ToolCall{ID: acc.id, Name: acc.name, Args: acc.args.String()})
	}

	if strings.TrimSpace(full.String()) == "" && len(toolCalls) == 0 {
		logger.Warn("[llm] 工具流正文与调用均为空",
			logger.String("model", model), logger.Int("max_tokens", maxTokens))
		return nil, fmt.Errorf("llm: 模型返回空轮次(model=%s)", model)
	}
	usage.Model = model
	usage.CostCents = estimateCostCents(model, usage.TokensIn, usage.TokensOut)
	return &ToolRoundResult{Content: full.String(), ToolCalls: toolCalls, Usage: usage}, nil
}
