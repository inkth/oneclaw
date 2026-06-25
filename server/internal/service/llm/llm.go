// Package llm 是 OpenRouter 的轻量客户端(手写 HTTP,风格同 echotik client)。
// Agent 用它做 chat completion + JSON 结构化输出。未配置 key 时 Configured()=false。
package llm

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/oneclaw/server/internal/config"
)

const endpoint = "https://openrouter.ai/api/v1/chat/completions"
const videoEndpoint = "https://openrouter.ai/api/v1/videos"

type Client struct {
	cfg        config.OpenRouterConfig
	http       *http.Client
	reviewHTTP *http.Client // 复盘模型专用(可走代理);ReviewProxy 空时即 http 本身
}

func New(cfg config.OpenRouterConfig) *Client {
	c := &Client{cfg: cfg, http: &http.Client{Timeout: 90 * time.Second}}
	// 复盘模型(海外 Gemini)经正向代理出网,绕开国内 IP 的 OpenRouter 地区限制;
	// 其余调用(deepseek 等国内可达)仍直连。代理 URL 无效时回退直连。
	c.reviewHTTP = c.http
	if cfg.ReviewProxy != "" {
		if u, err := url.Parse(cfg.ReviewProxy); err == nil {
			c.reviewHTTP = &http.Client{
				Timeout:   90 * time.Second,
				Transport: &http.Transport{Proxy: http.ProxyURL(u)},
			}
		}
	}
	return c
}

func (c *Client) Configured() bool    { return c.cfg.Configured() }
func (c *Client) Model() string       { return c.cfg.Model }
func (c *Client) ReviewModel() string { return c.cfg.ReviewModel }
func (c *Client) VideoModel() string {
	return c.cfg.VideoModel
}

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

// Chat 用默认文本模型(cfg.Model)发起一次对话。jsonMode=true 时请求 JSON 输出(并由 prompt 兜底)。
func (c *Client) Chat(ctx context.Context, system, user string, jsonMode bool, maxTokens int) (*Result, error) {
	return c.ChatWithModel(ctx, c.cfg.Model, system, user, jsonMode, maxTokens)
}

// ChatWithModel 指定模型发起一次对话(model 空回退默认文本模型)。投放复盘等需要换模型的调用点用它。
func (c *Client) ChatWithModel(ctx context.Context, model, system, user string, jsonMode bool, maxTokens int) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if model == "" {
		model = c.cfg.Model
	}
	if maxTokens <= 0 {
		maxTokens = 2000
	}
	body := chatReq{
		Model:       model,
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

	client := c.http
	if model == c.cfg.ReviewModel {
		client = c.reviewHTTP // 复盘模型走代理(若配置了 ReviewProxy)
	}
	res, err := client.Do(req)
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
		Model:     model,
		TokensIn:  parsed.Usage.PromptTokens,
		TokensOut: parsed.Usage.CompletionTokens,
		CostCents: estimateCostCents(model, parsed.Usage.PromptTokens, parsed.Usage.CompletionTokens),
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
	"google/gemini-3.5-flash":     {0.3, 2.5},
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

// ── 视频生成(OpenRouter /api/v1/videos,异步:提交 → 轮询 polling_url)──────

type VideoJob struct {
	ID           string   `json:"id"`
	PollingURL   string   `json:"polling_url"`
	Status       string   `json:"status"` // pending|in_progress|completed|failed|cancelled|expired
	GenerationID string   `json:"generation_id"`
	UnsignedURLs []string `json:"unsigned_urls"`
	Error        string   `json:"error"`
	Usage        struct {
		Cost float64 `json:"cost"`
	} `json:"usage"`
}

type VideoParams struct {
	Model       string
	Prompt      string
	DurationSec int
	AspectRatio string
	Resolution  string
	// FirstFrameURL 非空时走图生视频:该图作为成片首帧(需公网可直接下载的 URL)。
	FirstFrameURL string
	// ReferenceImageURLs 走 reference-to-video:作 input_references 跨整片保持主体(商品/人脸)一致,
	// 与 FirstFrameURL(帧锚)互补、可多张。需公网可直接下载的 URL。
	ReferenceImageURLs []string
}

// SubmitVideo 提交一次视频生成,返回 job(含 polling_url)。
func (c *Client) SubmitVideo(ctx context.Context, p VideoParams) (*VideoJob, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm/video: OPENROUTER_API_KEY 未配置")
	}
	model := p.Model
	if model == "" {
		model = c.cfg.VideoModel
	}
	body := map[string]any{"model": model, "prompt": p.Prompt}
	if p.DurationSec > 0 {
		body["duration"] = p.DurationSec
	}
	if p.AspectRatio != "" {
		body["aspect_ratio"] = p.AspectRatio
	}
	if p.Resolution != "" {
		body["resolution"] = p.Resolution
	}
	if p.FirstFrameURL != "" {
		body["frame_images"] = []map[string]any{{
			"type":       "image_url",
			"image_url":  map[string]string{"url": p.FirstFrameURL},
			"frame_type": "first_frame",
		}}
	}
	if len(p.ReferenceImageURLs) > 0 {
		refs := make([]map[string]any, 0, len(p.ReferenceImageURLs))
		for _, u := range p.ReferenceImageURLs {
			if u = strings.TrimSpace(u); u != "" {
				refs = append(refs, map[string]any{
					"type":      "image_url",
					"image_url": map[string]string{"url": u},
				})
			}
		}
		if len(refs) > 0 {
			body["input_references"] = refs
		}
	}
	return c.videoCall(ctx, http.MethodPost, videoEndpoint, body)
}

// PollVideo 查询一个视频任务的状态(GET 提交时返回的 polling_url)。
func (c *Client) PollVideo(ctx context.Context, pollingURL string) (*VideoJob, error) {
	if pollingURL == "" {
		return nil, fmt.Errorf("llm/video: 缺少 polling_url")
	}
	return c.videoCall(ctx, http.MethodGet, pollingURL, nil)
}

func (c *Client) videoCall(ctx context.Context, method, url string, body any) (*VideoJob, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", c.cfg.Referer)
	req.Header.Set("X-Title", "OneClaw")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("llm/video: 请求失败: %w", err)
	}
	defer res.Body.Close()

	var job VideoJob
	if err := json.NewDecoder(res.Body).Decode(&job); err != nil {
		return nil, fmt.Errorf("llm/video: 解析失败: %w", err)
	}
	if res.StatusCode >= 400 {
		if job.Error != "" {
			return nil, fmt.Errorf("llm/video: %s", job.Error)
		}
		return nil, fmt.Errorf("llm/video: HTTP %d", res.StatusCode)
	}
	return &job, nil
}

// VideoCostCents 把 usage.cost(美元)换成美分。
func VideoCostCents(usd float64) int { return int(usd*100 + 0.5) }

// GenerateImage 用图像模型生成一张图(chat/completions + modalities)。
// 返回解码后的字节 + content-type。响应里图为 base64 data URL。
func (c *Client) GenerateImage(ctx context.Context, prompt, aspectRatio string) ([]byte, string, error) {
	if !c.Configured() {
		return nil, "", fmt.Errorf("llm/image: OPENROUTER_API_KEY 未配置")
	}
	model := c.cfg.ImageModel
	body := map[string]any{
		"model":      model,
		"messages":   []chatMsg{{Role: "user", Content: prompt}},
		"modalities": []string{"image", "text"},
	}
	if aspectRatio != "" {
		body["image_config"] = map[string]any{"aspect_ratio": aspectRatio}
	}
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(buf))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", c.cfg.Referer)
	req.Header.Set("X-Title", "OneClaw")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("llm/image: 请求失败: %w", err)
	}
	defer res.Body.Close()

	var parsed struct {
		Choices []struct {
			Message struct {
				Images []struct {
					ImageURL struct {
						URL string `json:"url"`
					} `json:"image_url"`
				} `json:"images"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, "", fmt.Errorf("llm/image: 解析失败: %w", err)
	}
	if parsed.Error != nil {
		return nil, "", fmt.Errorf("llm/image: 上游错误: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 || len(parsed.Choices[0].Message.Images) == 0 {
		return nil, "", fmt.Errorf("llm/image: 未返回图像(HTTP %d)", res.StatusCode)
	}
	return decodeDataURL(parsed.Choices[0].Message.Images[0].ImageURL.URL)
}

// decodeDataURL 解析 "data:image/png;base64,XXXX" → (字节, content-type)。
func decodeDataURL(u string) ([]byte, string, error) {
	if !strings.HasPrefix(u, "data:") {
		return nil, "", fmt.Errorf("llm/image: 非 data URL")
	}
	comma := strings.IndexByte(u, ',')
	if comma < 0 {
		return nil, "", fmt.Errorf("llm/image: data URL 格式错误")
	}
	meta, payload := u[5:comma], u[comma+1:]
	ct := "image/png"
	if i := strings.IndexByte(meta, ';'); i >= 0 {
		ct = meta[:i]
	}
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", fmt.Errorf("llm/image: base64 解码失败: %w", err)
	}
	return data, ct, nil
}

// Download 用 key GET 一个受保护 URL(如 OpenRouter 视频 content),返回字节 + content-type。
func (c *Client) Download(ctx context.Context, url string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return nil, "", fmt.Errorf("download HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, "", err
	}
	return b, res.Header.Get("Content-Type"), nil
}
