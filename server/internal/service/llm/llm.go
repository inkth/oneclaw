// Package llm 是 OpenRouter 的轻量客户端(手写 HTTP,风格同 echotik client)。
// Agent 用它做 chat completion + JSON 结构化输出。未配置 key 时 Configured()=false。
package llm

import (
	"bufio"
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
	cfg config.OpenRouterConfig
	// http 一次性请求用,整体超时 120s。
	http *http.Client
	// streamHTTP 流式专用:Client.Timeout 会把「读完整个 body」也算进去,长回答必被腰斩,
	// 故这里不设整体超时,由调用方的 ctx 单独把关(见 runAdvisor 的 120s)。
	streamHTTP *http.Client
}

// New 全部调用一律直连 —— 所选模型均为国内可达。
// (曾经复盘模型走正向代理绕地区限制,2026-07-17 被 OpenRouter 判 ToS 违规封禁,已整条移除。)
func New(cfg config.OpenRouterConfig) *Client {
	return &Client{
		cfg:        cfg,
		http:       &http.Client{Timeout: 120 * time.Second},
		streamHTTP: &http.Client{},
	}
}

func (c *Client) Configured() bool       { return c.cfg.Configured() }
func (c *Client) Model() string          { return c.cfg.Model }
func (c *Client) AdvisorModel() string   { return c.cfg.AdvisorModel }
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
	StreamOptions  *streamOpts `json:"stream_options,omitempty"`
	ResponseFormat *respFormat `json:"response_format,omitempty"`
	Reasoning      *reasoning  `json:"reasoning,omitempty"`
}

// streamOpts 流式必须显式要 usage —— 否则最后一个 chunk 不带 token 数,
// estimateCostCents 拿到 0,成本会静默记错(不报错、不告警)。
type streamOpts struct {
	IncludeUsage bool `json:"include_usage"`
}

type reasoning struct {
	Effort string `json:"effort"`
}

// ChatOptions 只用于需要覆盖公共采样参数的调用点。零值保持现有行为。
type ChatOptions struct {
	Temperature     float64
	ReasoningEffort string
	// OnDelta 非空时整条调用改走流式:上游每吐一段正文就回调一次(只回正文,不含 reasoning)。
	// 返回值仍是累积好的完整文本 + usage,调用方的落库逻辑一行都不用改。
	OnDelta func(string)
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

// ChatWithOptions 同 Chat,但允许覆盖采样参数 / 挂流式回调(选品的单品判断走它)。
func (c *Client) ChatWithOptions(ctx context.Context, system, user string, jsonMode bool, maxTokens int, opts ChatOptions) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	msgs := []chatMsg{{Role: "system", Content: system}, {Role: "user", Content: user}}
	return c.doWithOptions(ctx, c.cfg.Model, msgs, jsonMode, maxTokens, opts)
}

// ChatVisionWithOptions 同 ChatVision,但允许挂流式回调(选品的看图判断走它)。
func (c *Client) ChatVisionWithOptions(ctx context.Context, model, system, user string, imageURLs []string, jsonMode bool, maxTokens int, opts ChatOptions) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if model == "" {
		model = c.cfg.Model
	}
	msgs := []chatMsg{{Role: "system", Content: system}, {Role: "user", Content: visionParts(user, imageURLs)}}
	return c.doWithOptions(ctx, model, msgs, jsonMode, maxTokens, opts)
}

// Message 一轮对话消息(Role=user|assistant),供带多轮历史的调用点(如跨境顾问)构造上下文。
type Message struct {
	Role    string
	Content string
}

// ChatThread 带多轮历史的对话:system + 依次的历史消息(model 空回退默认文本模型)。
func (c *Client) ChatThread(ctx context.Context, model, system string, thread []Message, jsonMode bool, maxTokens int) (*Result, error) {
	return c.ChatThreadWithOptions(ctx, model, system, thread, jsonMode, maxTokens, ChatOptions{})
}

// ChatThreadWithOptions 带多轮历史并允许按 Agent 覆盖采样/思考强度。
// 跨境顾问使用它降低随机性；其他 Agent 继续沿用公共默认值。
func (c *Client) ChatThreadWithOptions(ctx context.Context, model, system string, thread []Message, jsonMode bool, maxTokens int, opts ChatOptions) (*Result, error) {
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
	return c.doWithOptions(ctx, model, msgs, jsonMode, maxTokens, opts)
}

// ChatThreadVisionWithOptions 在多轮文本历史的最后一条 user 消息中附加图片。
// 这样顾问既能延续当前会话，也能看见用户本轮新上传的图片。
func (c *Client) ChatThreadVisionWithOptions(ctx context.Context, model, system string, thread []Message, imageURLs []string, jsonMode bool, maxTokens int, opts ChatOptions) (*Result, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("llm: OPENROUTER_API_KEY 未配置")
	}
	if model == "" {
		model = c.cfg.Model
	}
	msgs := make([]chatMsg, 0, len(thread)+1)
	msgs = append(msgs, chatMsg{Role: "system", Content: system})
	for i, m := range thread {
		content := any(m.Content)
		if i == len(thread)-1 && m.Role == "user" {
			content = visionParts(m.Content, imageURLs)
		}
		msgs = append(msgs, chatMsg{Role: m.Role, Content: content})
	}
	return c.doWithOptions(ctx, model, msgs, jsonMode, maxTokens, opts)
}

func visionParts(text string, imageURLs []string) []map[string]any {
	parts := []map[string]any{{"type": "text", "text": text}}
	for _, u := range imageURLs {
		if u = strings.TrimSpace(u); u != "" {
			parts = append(parts, map[string]any{
				"type":      "image_url",
				"image_url": map[string]string{"url": u},
			})
		}
	}
	return parts
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
	parts := visionParts(user, imageURLs)
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
	return c.doWithOptions(ctx, model, msgs, jsonMode, maxTokens, ChatOptions{})
}

func (c *Client) doWithOptions(ctx context.Context, model string, msgs []chatMsg, jsonMode bool, maxTokens int, opts ChatOptions) (*Result, error) {
	if maxTokens <= 0 {
		maxTokens = 2000
	}
	temperature := opts.Temperature
	if temperature <= 0 {
		temperature = 0.7
	}
	streaming := opts.OnDelta != nil
	body := chatReq{
		Model:       model,
		Messages:    msgs,
		MaxTokens:   maxTokens,
		Temperature: temperature,
		Stream:      streaming,
	}
	if streaming {
		body.StreamOptions = &streamOpts{IncludeUsage: true}
	}
	if opts.ReasoningEffort != "" {
		body.Reasoning = &reasoning{Effort: opts.ReasoningEffort}
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
	if streaming {
		req.Header.Set("Accept", "text/event-stream")
	}

	if streaming {
		return c.doStream(req, model, maxTokens, opts.OnDelta)
	}

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

// streamChunk 是 SSE 每行 data: 后的增量帧。usage 只在带 include_usage 的末帧出现。
type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
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

// doStream 读 SSE 流:边收边回调 onDelta,同时累积完整正文与 usage。
// 契约与 doWithOptions 完全一致(同样的空正文/上游拒绝判据),调用方拿到的仍是最终 Result。
func (c *Client) doStream(req *http.Request, model string, maxTokens int, onDelta func(string)) (*Result, error) {
	res, err := c.streamHTTP.Do(req)
	if err != nil {
		logger.Warn("[llm] 流式请求失败", logger.String("model", model), logger.Err(err))
		return nil, fmt.Errorf("llm: 请求失败: %w", err)
	}
	defer res.Body.Close()

	// 非 200 时上游回的是普通 JSON 错误体而不是流,照非流式路径的口径留痕。
	if res.StatusCode >= 400 {
		var parsed chatResp
		_ = json.NewDecoder(res.Body).Decode(&parsed)
		msg := fmt.Sprintf("HTTP %d", res.StatusCode)
		if parsed.Error != nil && parsed.Error.Message != "" {
			msg = parsed.Error.Message
		}
		logger.Warn("[llm] 流式上游拒绝",
			logger.String("model", model), logger.Int("http", res.StatusCode), logger.String("upstream", msg))
		return nil, fmt.Errorf("llm: 上游错误: %s", msg)
	}

	var (
		full  strings.Builder
		usage Usage
		got   bool // 是否收到过 usage 帧
	)
	sc := bufio.NewScanner(res.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024) // 单帧可能较大(长 delta / usage 帧),放宽上限
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		// 空行是 SSE 帧分隔;": OPENROUTER PROCESSING" 是上游保活注释,都跳过。
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
		var chunk streamChunk
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			continue // 单帧解析失败不致命,跳过继续读
		}
		if chunk.Error != nil {
			logger.Warn("[llm] 流中上游拒绝",
				logger.String("model", model), logger.String("upstream", chunk.Error.Message))
			return nil, fmt.Errorf("llm: 上游错误: %s", chunk.Error.Message)
		}
		if chunk.Usage != nil {
			usage.TokensIn, usage.TokensOut, got = chunk.Usage.PromptTokens, chunk.Usage.CompletionTokens, true
		}
		for _, ch := range chunk.Choices {
			if ch.Delta.Content == "" {
				continue
			}
			full.WriteString(ch.Delta.Content)
			onDelta(ch.Delta.Content)
		}
	}
	if err := sc.Err(); err != nil {
		// 读到一半断流:已推给用户的部分不算数,按失败处理,避免半截答案落库当成品。
		logger.Warn("[llm] 流中断", logger.String("model", model), logger.Err(err))
		return nil, fmt.Errorf("llm: 流中断: %w", err)
	}

	// 与非流式同一条防线:reasoning 模型烧光 max_tokens 时正文为空,必须当失败。
	if strings.TrimSpace(full.String()) == "" {
		logger.Warn("[llm] 流式正文为空(疑似 max_tokens 被推理耗尽)",
			logger.String("model", model), logger.Int("max_tokens", maxTokens),
			logger.Int("tokens_out", usage.TokensOut))
		return nil, fmt.Errorf("llm: 模型返回空正文(model=%s, max_tokens=%d)", model, maxTokens)
	}
	// usage 拿不到 → 成本会静默记 0。这类降级过去在生产埋了数周,必须留痕。
	if !got || usage.TokensOut == 0 {
		logger.Warn("[llm] 流式未拿到 usage,本次成本将记为 0",
			logger.String("model", model), logger.Int("chars", len([]rune(full.String()))))
	}
	usage.Model = model
	usage.CostCents = estimateCostCents(model, usage.TokensIn, usage.TokensOut)
	return &Result{Content: full.String(), Usage: usage}, nil
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
	"qwen/qwen3.7-plus":          {0.32, 1.28},
	// OpenRouter 2026-07-19 公示价;含图调用的图片 token 另计。
	"minimax/minimax-m3": {0.3, 1.2},
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

// GenerateImage 用图像模型(seedream)生成一张图(chat/completions + modalities:image)。
// refImageURLs 非空时作为参考图输入(编辑锚定/多图合成/虚拟试穿):OpenRouter 把这些 URL
// 交给上游,由上游服务端自行下载,故必须是公网可达地址(我们的 COS public-read 满足)。
// aspectRatio 传 "1:1"/"9:16"/"16:9"/"3:4"/"4:3" 等;空则用模型默认(约 2048 见方)。
// seedream 走字节自家 provider,国内直连可达、直接返回 JPEG,无需代理或队列轮询。
// 返回解码后的字节 + content-type。响应里图为 base64 data URL。
func (c *Client) GenerateImage(ctx context.Context, prompt, aspectRatio string, refImageURLs []string) ([]byte, string, error) {
	if !c.Configured() {
		return nil, "", fmt.Errorf("llm/image: OPENROUTER_API_KEY 未配置")
	}
	// user 消息体:无参考图时纯文本 prompt;带参考图时构造为 content-parts 数组
	// (文本 + 逐张 image_url,照搬 ChatVision 的写法)。
	var content any = prompt
	if len(refImageURLs) > 0 {
		parts := []map[string]any{{"type": "text", "text": prompt}}
		for _, u := range refImageURLs {
			if u = strings.TrimSpace(u); u != "" {
				parts = append(parts, map[string]any{
					"type":      "image_url",
					"image_url": map[string]string{"url": u},
				})
			}
		}
		content = parts
	}
	body := map[string]any{
		"model":      c.cfg.ImageModel,
		"messages":   []chatMsg{{Role: "user", Content: content}},
		"modalities": []string{"image"}, // seedream 只出图不出文,带 "text" 会 404
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
