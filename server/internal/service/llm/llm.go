// Package llm 是 OpenRouter 的轻量客户端(手写 HTTP,风格同 echotik client)。
// Agent 用它做 chat completion + JSON 结构化输出。未配置 key 时 Configured()=false。
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/oneclaw/server/internal/config"
)

const endpoint = "https://openrouter.ai/api/v1/chat/completions"

type Client struct {
	cfg  config.OpenRouterConfig
	http *http.Client
}

func New(cfg config.OpenRouterConfig) *Client {
	return &Client{cfg: cfg, http: &http.Client{Timeout: 90 * time.Second}}
}

func (c *Client) Configured() bool { return c.cfg.Configured() }
func (c *Client) Model() string    { return c.cfg.Model }

type Usage struct {
	Model     string `json:"model"`
	TokensIn  int    `json:"tokensIn"`
	TokensOut int    `json:"tokensOut"`
	CostCents int    `json:"costCents"`
}

type Result struct {
	Content string
	Usage   Usage
}

type chatReq struct {
	Model          string      `json:"model"`
	Messages       []chatMsg   `json:"messages"`
	MaxTokens      int         `json:"max_tokens"`
	Temperature    float64     `json:"temperature"`
	Stream         bool        `json:"stream"`
	ResponseFormat *respFormat `json:"response_format,omitempty"`
}

type chatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type respFormat struct {
	Type string `json:"type"`
}

type chatResp struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// Chat 发起一次对话。jsonMode=true 时请求 JSON 输出(并由 prompt 兜底)。
func (c *Client) Chat(ctx context.Context, system, user string, jsonMode bool, maxTokens int) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if maxTokens <= 0 {
		maxTokens = 2000
	}
	body := chatReq{
		Model:       c.cfg.Model,
		Messages:    []chatMsg{{Role: "system", Content: system}, {Role: "user", Content: user}},
		MaxTokens:   maxTokens,
		Temperature: 0.7,
		Stream:      false,
	}
	if jsonMode {
		body.ResponseFormat = &respFormat{Type: "json_object"}
	}
	buf, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", c.cfg.Referer)
	req.Header.Set("X-Title", "OneClaw")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("llm: 请求失败: %w", err)
	}
	defer res.Body.Close()

	var parsed chatResp
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("llm: 解析响应失败: %w", err)
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("llm: 上游错误: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("llm: 空响应(HTTP %d)", res.StatusCode)
	}

	usage := Usage{
		Model:     c.cfg.Model,
		TokensIn:  parsed.Usage.PromptTokens,
		TokensOut: parsed.Usage.CompletionTokens,
		CostCents: estimateCostCents(c.cfg.Model, parsed.Usage.PromptTokens, parsed.Usage.CompletionTokens),
	}
	return &Result{Content: parsed.Choices[0].Message.Content, Usage: usage}, nil
}

// ExtractJSON 从可能带 markdown 围栏的文本里抽出 JSON 串(对齐前端 extractJson)。
func ExtractJSON(text string) string {
	s := strings.TrimSpace(text)
	// 去掉 ```json ... ``` 围栏
	if i := strings.Index(s, "```"); i >= 0 {
		rest := s[i+3:]
		rest = strings.TrimPrefix(rest, "json")
		if j := strings.Index(rest, "```"); j >= 0 {
			s = strings.TrimSpace(rest[:j])
		}
	}
	if json.Valid([]byte(s)) {
		return s
	}
	// 退而求其次:取最外层 {} 或 []
	if a, b := strings.Index(s, "{"), strings.LastIndex(s, "}"); a >= 0 && b > a {
		return s[a : b+1]
	}
	if a, b := strings.Index(s, "["), strings.LastIndex(s, "]"); a >= 0 && b > a {
		return s[a : b+1]
	}
	return s
}

// 价格表(每 1M token,美元);用于粗估成本落库。
var priceTable = map[string][2]float64{ // {input, output}
	"anthropic/claude-sonnet-4.5": {3, 15},
	"anthropic/claude-haiku-4.5":  {1, 5},
	"openai/gpt-4o":               {2.5, 10},
	"openai/gpt-4o-mini":          {0.15, 0.6},
	"google/gemini-2.5-pro":       {1.25, 10},
	"deepseek/deepseek-chat":      {0.14, 0.28},
}

func estimateCostCents(model string, tokensIn, tokensOut int) int {
	p, ok := priceTable[model]
	if !ok {
		p = [2]float64{0.5, 1.5} // 未知模型保守估
	}
	usd := (float64(tokensIn)*p[0] + float64(tokensOut)*p[1]) / 1_000_000
	return int(usd*100 + 0.5)
}
