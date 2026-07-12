// Package fal 是 fal.ai 的轻量客户端(图像生成)。国内可达,不受 OpenRouter 美国模型的区域限制。
package fal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/faxianmao/server/internal/config"
)

type Client struct {
	cfg  config.FalConfig
	http *http.Client // 生成 API(queue.fal.run):国内直连可达
	dl   *http.Client // 结果图下载(fal.media):可走代理,跨境直连会挂死
}

func New(cfg config.FalConfig) *Client {
	// 大图模型(如 Seedream V4.5)同步出图跨境可能超过 2 分钟;
	// 在线链路各调用方自带更短的 ctx 超时,不受这个上限影响。
	api := &http.Client{Timeout: 300 * time.Second}
	dl := api
	// 结果图托管在 fal.media,跨境直连 TLS 间歇挂死;配了代理就让下载走代理(实测 6s vs 直连超时)。
	if cfg.DownloadProxy != "" {
		if u, err := url.Parse(cfg.DownloadProxy); err == nil {
			dl = &http.Client{
				Timeout:   300 * time.Second,
				Transport: &http.Transport{Proxy: http.ProxyURL(u)},
			}
		}
	}
	return &Client{cfg: cfg, http: api, dl: dl}
}

func (c *Client) Configured() bool { return c.cfg.Configured() }

// GenerateImage 调 fal flux 出图,下载后返回字节 + content-type。
func (c *Client) GenerateImage(ctx context.Context, prompt, imageSize string) ([]byte, string, error) {
	return c.GenerateImageWith(ctx, c.cfg.ImageModel, prompt, imageSize, nil)
}

// GenerateImageWith 调指定 fal 模型出图;refImageURLs 非空时作为编辑/参考输入
// (如 Seedream edit 的 image_urls,用于同一人设多镜头的一致性)。返回首图字节 + content-type。
func (c *Client) GenerateImageWith(ctx context.Context, modelPath, prompt, imageSize string, refImageURLs []string) ([]byte, string, error) {
	if !c.Configured() {
		return nil, "", fmt.Errorf("fal: FALAI_API_KEY 未配置")
	}
	if modelPath == "" {
		modelPath = c.cfg.ImageModel
	}
	if imageSize == "" {
		imageSize = "portrait_16_9"
	}
	payload := map[string]any{
		"prompt":     prompt,
		"image_size": imageSize,
		"num_images": 1,
	}
	if len(refImageURLs) > 0 {
		payload["image_urls"] = refImageURLs
	}
	body, _ := json.Marshal(payload)
	url := strings.TrimRight(c.cfg.BaseURL, "/") + "/" + modelPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Key "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("fal: 请求失败: %w", err)
	}
	defer res.Body.Close()

	var parsed struct {
		Images []struct {
			URL         string `json:"url"`
			ContentType string `json:"content_type"`
		} `json:"images"`
		Detail any `json:"detail"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, "", fmt.Errorf("fal: 解析失败: %w", err)
	}
	if len(parsed.Images) == 0 || parsed.Images[0].URL == "" {
		return nil, "", fmt.Errorf("fal: 未返回图像(HTTP %d)", res.StatusCode)
	}
	img := parsed.Images[0]
	data, ct, err := c.download(ctx, img.URL)
	if err != nil {
		return nil, "", err
	}
	if ct == "" {
		ct = img.ContentType
	}
	if ct == "" {
		ct = "image/jpeg"
	}
	return data, ct, nil
}

// GenerateImageQueued 走 fal 队列 API 出图:提交立即返回 → 轮询状态 → 完成后取结果。
// 每次 HTTP 都是短请求,适合慢模型/跨境链路(同步接口会被长连接卡死)。
func (c *Client) GenerateImageQueued(ctx context.Context, modelPath, prompt, imageSize string, refImageURLs []string) ([]byte, string, error) {
	if !c.Configured() {
		return nil, "", fmt.Errorf("fal: FALAI_API_KEY 未配置")
	}
	if modelPath == "" {
		modelPath = c.cfg.ImageModel
	}
	if imageSize == "" {
		imageSize = "portrait_16_9"
	}
	payload := map[string]any{"prompt": prompt, "image_size": imageSize, "num_images": 1}
	if len(refImageURLs) > 0 {
		payload["image_urls"] = refImageURLs
	}
	return c.queueRun(ctx, modelPath, payload)
}

// TryOn 虚拟试穿:把 garment(服饰平铺/挂拍图)穿到 model(模特/真人)身上,出上身图。
// 走 fal 专用试穿模型(如 fashn/tryon),入参与出图模型不同(model_image + garment_image),
// 同样走队列 API,跨境不被长连接卡死。
func (c *Client) TryOn(ctx context.Context, modelImageURL, garmentImageURL string) ([]byte, string, error) {
	if !c.Configured() {
		return nil, "", fmt.Errorf("fal: FALAI_API_KEY 未配置")
	}
	modelPath := c.cfg.TryOnModel
	if modelPath == "" {
		modelPath = "fal-ai/fashn/tryon/v1.6"
	}
	payload := map[string]any{
		"model_image":   modelImageURL,
		"garment_image": garmentImageURL,
		"category":      "auto", // 自动判断上装/下装/连体
	}
	return c.queueRun(ctx, modelPath, payload)
}

// queueRun 提交任意 payload 到 fal 队列 API → 轮询状态 → 完成后取首图字节 + content-type。
func (c *Client) queueRun(ctx context.Context, modelPath string, payload map[string]any) ([]byte, string, error) {
	body, _ := json.Marshal(payload)

	var job struct {
		RequestID   string `json:"request_id"`
		StatusURL   string `json:"status_url"`
		ResponseURL string `json:"response_url"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "https://queue.fal.run/"+modelPath, body, &job); err != nil {
		return nil, "", fmt.Errorf("fal/queue: 提交失败: %w", err)
	}
	if job.StatusURL == "" || job.ResponseURL == "" {
		return nil, "", fmt.Errorf("fal/queue: 提交响应缺少轮询地址")
	}

	for {
		select {
		case <-ctx.Done():
			return nil, "", fmt.Errorf("fal/queue: 等待超时: %w", ctx.Err())
		case <-time.After(4 * time.Second):
		}
		var st struct {
			Status string `json:"status"`
		}
		if err := c.doJSON(ctx, http.MethodGet, job.StatusURL, nil, &st); err != nil {
			continue // 轮询抖动,下轮再试
		}
		switch st.Status {
		case "COMPLETED":
			var parsed struct {
				Images []struct {
					URL         string `json:"url"`
					ContentType string `json:"content_type"`
				} `json:"images"`
			}
			if err := c.doJSON(ctx, http.MethodGet, job.ResponseURL, nil, &parsed); err != nil {
				return nil, "", fmt.Errorf("fal/queue: 取结果失败: %w", err)
			}
			if len(parsed.Images) == 0 || parsed.Images[0].URL == "" {
				return nil, "", fmt.Errorf("fal/queue: 未返回图像")
			}
			data, ct, err := c.download(ctx, parsed.Images[0].URL)
			if err != nil {
				return nil, "", err
			}
			if ct == "" {
				ct = parsed.Images[0].ContentType
			}
			return data, ct, nil
		case "IN_QUEUE", "IN_PROGRESS", "":
			// 继续等
		default:
			return nil, "", fmt.Errorf("fal/queue: 任务状态 %s", st.Status)
		}
	}
}

// doJSON 发请求并解析 JSON 响应(带 fal 鉴权头)。
func (c *Client) doJSON(ctx context.Context, method, url string, body []byte, out any) error {
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Key "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// download 拉取生成结果图。fal.media CDN 跨境间歇性 TLS 超时,分步重试 3 次
// (只重下载、不重新生成,不重复消耗生成费用)。
func (c *Client) download(ctx context.Context, url string) ([]byte, string, error) {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		if attempt > 1 {
			select {
			case <-ctx.Done():
				return nil, "", fmt.Errorf("fal: 下载图像失败: %w", lastErr)
			case <-time.After(3 * time.Second):
			}
		}
		b, ct, err := c.downloadOnce(ctx, url)
		if err == nil {
			return b, ct, nil
		}
		lastErr = err
	}
	return nil, "", fmt.Errorf("fal: 下载图像失败(重试 3 次): %w", lastErr)
}

func (c *Client) downloadOnce(ctx context.Context, imgURL string) ([]byte, string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, imgURL, nil)
	res, err := c.dl.Do(req) // 结果图下载走代理(若配置),绕 fal.media 跨境挂死
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return nil, "", fmt.Errorf("HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(res.Body)
	return b, res.Header.Get("Content-Type"), err
}

// ImageSizeForAspect 把宽高比映射到 fal flux 的 image_size 预设。
func ImageSizeForAspect(ar string) string {
	switch ar {
	case "16:9":
		return "landscape_16_9"
	case "1:1":
		return "square_hd"
	default: // 9:16 及其它
		return "portrait_16_9"
	}
}
