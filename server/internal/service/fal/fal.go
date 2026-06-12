// Package fal 是 fal.ai 的轻量客户端(图像生成)。国内可达,不受 OpenRouter 美国模型的区域限制。
package fal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/oneclaw/server/internal/config"
)

type Client struct {
	cfg  config.FalConfig
	http *http.Client
}

func New(cfg config.FalConfig) *Client {
	// 大图模型(如 Seedream V4.5)同步出图跨境可能超过 2 分钟;
	// 在线链路各调用方自带更短的 ctx 超时,不受这个上限影响。
	return &Client{cfg: cfg, http: &http.Client{Timeout: 300 * time.Second}}
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

func (c *Client) download(ctx context.Context, url string) ([]byte, string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("fal: 下载图像失败: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return nil, "", fmt.Errorf("fal: 下载图像 HTTP %d", res.StatusCode)
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
