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
	"strings"
	"time"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/logger"
)

const endpoint = "https://openrouter.ai/api/v1/chat/completions"
const videoEndpoint = "https://openrouter.ai/api/v1/videos"

type Client struct {
	cfg  config.OpenRouterConfig
	http *http.Client
}

// New 全部调用一律直连 —— 所选模型均为国内可达。
// (曾经复盘模型走正向代理绕地区限制,2026-07-17 被 OpenRouter 判 ToS 违规封禁,已整条移除。)
func New(cfg config.OpenRouterConfig) *Client {
	return &Client{cfg: cfg, http: &http.Client{Timeout: 90 * time.Second}}
}

func (c *Client) Configured() bool       { return c.cfg.Configured() }
func (c *Client) Model() string          { return c.cfg.Model }
func (c *Client) TranslateModel() string { return c.cfg.TranslateModel }
func (c *Client) ReviewModel() string    { return c.cfg.ReviewModel }
func (c *Client) AudioModel() string     { return c.cfg.AudioModel }
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
	Role string `json:"role"`
	// Content 多数时候是纯文本 string;vision 调用时是 content-parts 数组
	// ([{type:"text"...},{type:"image_url"...}])。OpenRouter 两种都接受。
	Content any `json:"content"`
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
	msgs := []chatMsg{{Role: "system", Content: system}, {Role: "user", Content: user}}
	return c.do(ctx, model, msgs, jsonMode, maxTokens)
}

// Message 一轮对话消息(Role=user|assistant),供带多轮历史的调用点(如跨境顾问)构造上下文。
type Message struct {
	Role    string
	Content string
}

// ChatThread 带多轮历史的对话:system + 依次的历史消息(model 空回退默认文本模型)。
func (c *Client) ChatThread(ctx context.Context, model, system string, thread []Message, jsonMode bool, maxTokens int) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if model == "" {
		model = c.cfg.Model
	}
	msgs := make([]chatMsg, 0, len(thread)+1)
	msgs = append(msgs, chatMsg{Role: "system", Content: system})
	for _, m := range thread {
		msgs = append(msgs, chatMsg{Role: m.Role, Content: m.Content})
	}
	return c.do(ctx, model, msgs, jsonMode, maxTokens)
}

// ChatVision 让多模态模型「看图」对话:user 文本 + 一张或多张图片 URL 一起喂给模型。
// model 须指向 vision-capable 模型(默认即 ReviewModel=minimax/minimax-m3);全部直连。
func (c *Client) ChatVision(ctx context.Context, model, system, user string, imageURLs []string, jsonMode bool, maxTokens int) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if model == "" {
		model = c.cfg.Model
	}
	// user 消息体构造为 content-parts 数组:先文本,再逐张图(照搬视频路径的 image_url 写法)。
	parts := []map[string]any{{"type": "text", "text": user}}
	for _, u := range imageURLs {
		if u = strings.TrimSpace(u); u != "" {
			parts = append(parts, map[string]any{
				"type":      "image_url",
				"image_url": map[string]string{"url": u},
			})
		}
	}
	msgs := []chatMsg{{Role: "system", Content: system}, {Role: "user", Content: parts}}
	return c.do(ctx, model, msgs, jsonMode, maxTokens)
}

// AudioPart 是一段内联音频(base64,不带 data: 前缀),喂给支持音频输入的多模态模型。
type AudioPart struct {
	Data   string // base64 编码的音频字节
	Format string // wav|mp3|ogg|m4a... 须与音频实际编码一致
}

// ChatAV 让多模态模型同时「听音频」+「看若干帧画面」对话:用于视频解析(转录口播 + 翻译 + 带货拆解)。
// model 须指向支持 audio 输入的模型。注意:当前 ReviewModel(minimax)不吃音频,传它会得到
// 404 "No endpoints found that support input audio" —— 调用方须显式指定音频模型(见 agent_video_analysis)。
// audio 可空(无口播时退化为纯看帧);imageDataURLs 传 data:image/... base64 或公网 URL 均可。
func (c *Client) ChatAV(ctx context.Context, model, system, user string, audio *AudioPart, imageDataURLs []string, jsonMode bool, maxTokens int) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if model == "" {
		model = c.cfg.Model
	}
	// user 消息体构造为 content-parts 数组:文本 → 音频 → 逐帧图(沿用 ChatVision 的 image_url 写法)。
	parts := []map[string]any{{"type": "text", "text": user}}
	if audio != nil && strings.TrimSpace(audio.Data) != "" {
		parts = append(parts, map[string]any{
			"type":        "input_audio",
			"input_audio": map[string]string{"data": audio.Data, "format": audio.Format},
		})
	}
	for _, u := range imageDataURLs {
		if u = strings.TrimSpace(u); u != "" {
			parts = append(parts, map[string]any{
				"type":      "image_url",
				"image_url": map[string]string{"url": u},
			})
		}
	}
	msgs := []chatMsg{{Role: "system", Content: system}, {Role: "user", Content: parts}}
	return c.do(ctx, model, msgs, jsonMode, maxTokens)
}

// do 是 chat completion 的公共执行体:构造请求 + 选 client(复盘/vision 模型走代理)+ 发送 + 解析 usage。
func (c *Client) do(ctx context.Context, model string, msgs []chatMsg, jsonMode bool, maxTokens int) (*Result, error) {
	if maxTokens <= 0 {
		maxTokens = 2000
	}
	body := chatReq{
		Model:       model,
		Messages:    msgs,
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
	req.Header.Set("X-Title", "Faxianmao")

	res, err := c.http.Do(req)
	if err != nil {
		logger.Warn("[llm] 请求失败", logger.String("model", model), logger.Err(err))
		return nil, fmt.Errorf("llm: 请求失败: %w", err)
	}
	defer res.Body.Close()

	var parsed chatResp
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		logger.Warn("[llm] 解析响应失败",
			logger.String("model", model), logger.Int("http", res.StatusCode), logger.Err(err))
		return nil, fmt.Errorf("llm: 解析响应失败: %w", err)
	}
	if parsed.Error != nil {
		// 上游拒绝(地区限制/ToS/额度)一律留痕:这类故障过去只体现为静默降级,
		// 生产曾整条多模态链路 403 数周无人察觉。
		logger.Warn("[llm] 上游拒绝",
			logger.String("model", model), logger.Int("http", res.StatusCode),
			logger.String("upstream", parsed.Error.Message))
		return nil, fmt.Errorf("llm: 上游错误: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		logger.Warn("[llm] 空响应", logger.String("model", model), logger.Int("http", res.StatusCode))
		return nil, fmt.Errorf("llm: 空响应(HTTP %d)", res.StatusCode)
	}
	// 无报错但正文为空:reasoning 模型烧光 max_tokens 时会这样(实测 stepfun/xiaomi 均如此)。
	// 必须当失败处理并留痕,否则调用点会把空串当正常产出。
	if strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		logger.Warn("[llm] 正文为空(疑似 max_tokens 被推理耗尽)",
			logger.String("model", model), logger.Int("max_tokens", maxTokens),
			logger.Int("tokens_out", parsed.Usage.CompletionTokens))
		return nil, fmt.Errorf("llm: 模型返回空正文(model=%s, max_tokens=%d)", model, maxTokens)
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
	// 退而求其次:从首个 { 或 [ 起,用 Decoder 解出第一个完整 JSON 值,忽略尾部
	// 多余字符(模型偶尔在合法 JSON 后多吐一个 } 或追加散文,会导致整体 Unmarshal 失败)。
	if i := strings.IndexAny(s, "{["); i >= 0 {
		dec := json.NewDecoder(strings.NewReader(s[i:]))
		var raw json.RawMessage
		if err := dec.Decode(&raw); err == nil {
			return string(raw)
		}
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
	// 以下取自 OpenRouter /api/v1/models 的 pricing(2026-07-17 核对)。
	// 注:deepseek-chat 此前误记为 {0.14, 0.28},output 实际是 0.8,成本一直被低估近 3 倍。
	"deepseek/deepseek-v4-pro":   {0.435, 0.87},
	"deepseek/deepseek-v4-flash": {0.098, 0.196},
	"deepseek/deepseek-chat":     {0.2, 0.8},
	// minimax 由生产实测两次调用的 usage.cost 反解(251in/603out=$0.000772、251in/429out=$0.000563);
	// 含图调用实际计费略高于此(图片另算),粗估用途够。
	"minimax/minimax-m3": {0.2, 1.2},
	// voxtral 视频转录用;文本单价按官方 pricing,音频 token 另计,本表只做粗估。
	"mistralai/voxtral-small-24b-2507": {0.1, 0.3},
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
	req.Header.Set("X-Title", "Faxianmao")

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
	req.Header.Set("X-Title", "Faxianmao")

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
