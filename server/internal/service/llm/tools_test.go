package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/faxianmao/server/internal/config"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	old := endpoint
	endpoint = srv.URL
	t.Cleanup(func() { endpoint = old })
	return New(config.OpenRouterConfig{APIKey: "test-key", Model: "test/model"})
}

// 非流式:message.tool_calls 解析为 ToolCall,开场白 content 一并带回。
func TestChatThreadToolsParsesToolCalls(t *testing.T) {
	var gotReq chatReq
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotReq)
		_, _ = w.Write([]byte(`{
			"choices":[{"message":{"content":"我来查一下。","tool_calls":[
				{"id":"call_1","type":"function","function":{"name":"search_products","arguments":"{\"maxPriceUsd\":10}"}}
			]}}],
			"usage":{"prompt_tokens":100,"completion_tokens":20}
		}`))
	})

	res, err := c.ChatThreadTools(context.Background(), "test/model", "sys",
		[]ThreadMsg{{Role: "user", Content: "找便宜货"}},
		[]Tool{{Name: "search_products", Description: "检索", Parameters: map[string]any{"type": "object"}}},
		500, ChatOptions{})
	if err != nil {
		t.Fatalf("ChatThreadTools: %v", err)
	}
	if len(res.ToolCalls) != 1 || res.ToolCalls[0].Name != "search_products" ||
		res.ToolCalls[0].ID != "call_1" || res.ToolCalls[0].Args != `{"maxPriceUsd":10}` {
		t.Fatalf("tool calls 解析错误: %+v", res.ToolCalls)
	}
	if res.Content != "我来查一下。" {
		t.Fatalf("content = %q", res.Content)
	}
	if res.Usage.TokensIn != 100 || res.Usage.TokensOut != 20 {
		t.Fatalf("usage = %+v", res.Usage)
	}
	// 请求线材:tools 字段与消息角色按 OpenAI 形态上行。
	if len(gotReq.Tools) != 1 || gotReq.Tools[0].Type != "function" || gotReq.Tools[0].Function.Name != "search_products" {
		t.Fatalf("请求 tools 线材错误: %+v", gotReq.Tools)
	}
	if gotReq.Messages[0].Role != "system" || gotReq.Messages[1].Role != "user" {
		t.Fatalf("消息序错误: %+v", gotReq.Messages)
	}
}

// 工具往返消息(assistant.tool_calls / tool.tool_call_id)按线协议上行。
func TestChatThreadToolsRoundTripMessages(t *testing.T) {
	var raw map[string]any
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&raw)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"最终回答"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`))
	})

	res, err := c.ChatThreadTools(context.Background(), "", "sys", []ThreadMsg{
		{Role: "user", Content: "问"},
		{Role: "assistant", Content: "", ToolCalls: []ToolCall{{ID: "call_1", Name: "search_products", Args: `{}`}}},
		{Role: "tool", ToolCallID: "call_1", Content: "#1 结果"},
	}, nil, 500, ChatOptions{})
	if err != nil {
		t.Fatalf("ChatThreadTools: %v", err)
	}
	if res.Content != "最终回答" || len(res.ToolCalls) != 0 {
		t.Fatalf("res = %+v", res)
	}
	msgs := raw["messages"].([]any)
	asst := msgs[2].(map[string]any)
	if asst["tool_calls"] == nil {
		t.Fatalf("assistant 消息缺 tool_calls: %v", asst)
	}
	toolMsg := msgs[3].(map[string]any)
	if toolMsg["tool_call_id"] != "call_1" || toolMsg["role"] != "tool" {
		t.Fatalf("tool 消息线材错误: %v", toolMsg)
	}
	// tools 为空时不应上行该字段(退化普通对话)。
	if _, has := raw["tools"]; has {
		t.Fatalf("tools 为空仍上行了 tools 字段")
	}
}

// 流式:arguments 跨帧分片必须按 index 累积;正文增量回调 OnDelta;usage 末帧收取。
func TestChatThreadToolsStreamAccumulatesFragments(t *testing.T) {
	sse := "" +
		`data: {"choices":[{"delta":{"content":"我来"}}]}` + "\n\n" +
		`data: {"choices":[{"delta":{"content":"查。","tool_calls":[{"index":0,"id":"call_a","function":{"name":"search_products","arguments":"{\"max"}}]}}]}` + "\n\n" +
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"PriceUsd\":10}"}}]}}]}` + "\n\n" +
		`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","function":{"name":"search_products","arguments":"{\"sort\":\"sale7d\"}"}}]}}]}` + "\n\n" +
		`data: {"choices":[],"usage":{"prompt_tokens":50,"completion_tokens":30}}` + "\n\n" +
		"data: [DONE]\n\n"
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(sse))
	})

	var streamed string
	res, err := c.ChatThreadTools(context.Background(), "test/model", "sys",
		[]ThreadMsg{{Role: "user", Content: "问"}},
		[]Tool{{Name: "search_products", Parameters: map[string]any{"type": "object"}}},
		500, ChatOptions{OnDelta: func(s string) { streamed += s }})
	if err != nil {
		t.Fatalf("ChatThreadTools stream: %v", err)
	}
	if streamed != "我来查。" || res.Content != "我来查。" {
		t.Fatalf("正文流错误: streamed=%q content=%q", streamed, res.Content)
	}
	if len(res.ToolCalls) != 2 {
		t.Fatalf("应累积出 2 个调用: %+v", res.ToolCalls)
	}
	if res.ToolCalls[0].ID != "call_a" || res.ToolCalls[0].Args != `{"maxPriceUsd":10}` {
		t.Fatalf("分片累积错误: %+v", res.ToolCalls[0])
	}
	if res.ToolCalls[1].ID != "call_b" || res.ToolCalls[1].Args != `{"sort":"sale7d"}` {
		t.Fatalf("第二调用错误: %+v", res.ToolCalls[1])
	}
	if res.Usage.TokensIn != 50 || res.Usage.TokensOut != 30 {
		t.Fatalf("usage = %+v", res.Usage)
	}
}

// 正文与调用双空 → 报错(对齐既有空正文防线),不产出空轮次。
func TestChatThreadToolsEmptyRoundFails(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":""}}],"usage":{"prompt_tokens":1,"completion_tokens":0}}`))
	})
	if _, err := c.ChatThreadTools(context.Background(), "", "sys",
		[]ThreadMsg{{Role: "user", Content: "问"}}, nil, 100, ChatOptions{}); err == nil {
		t.Fatal("空轮次应报错")
	}
}
