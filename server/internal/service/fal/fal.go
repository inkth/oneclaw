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
	return &Client{cfg: cfg, http: &http.Client{Timeout: 120 * time.Second}}
}

func (c *Client) Configured() bool { return c.cfg.Configured() }

// GenerateImage 调 fal flux 出图,下载后返回字节 + content-type。
func (c *Client) GenerateImage(ctx context.Context, prompt, imageSize string) ([]byte, string, error) {
	if !c.Configured() {
		return nil, "", fmt.Errorf("fal: FALAI_API_KEY 未配置")
	}
	if imageSize == "" {
		imageSize = "portrait_16_9"
	}
	body, _ := json.Marshal(map[string]any{
		"prompt":     prompt,
		"image_size": imageSize,
		"num_images": 1,
	})
	url := strings.TrimRight(c.cfg.BaseURL, "/") + "/" + c.cfg.ImageModel
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
