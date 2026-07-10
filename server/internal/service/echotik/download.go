package echotik

import (
	"context"
	"fmt"
	"time"
)

// VideoDownloadInfo 是 /realtime/video/download-url 的返回体。
// 返回的下载/播放地址有时效(不适合长期缓存),调用方须立即下载转存到自有存储。
type VideoDownloadInfo struct {
	VideoID                string `json:"video_id"`
	NoWatermarkDownloadURL string `json:"no_watermark_download_url"`
	DownloadURL            string `json:"download_url"`
	PlayURL                string `json:"play_url"`
	CoverURL               string `json:"cover_url"`
}

// BestURL 取址优先级:无水印下载 → 普通下载 → 播放地址。
func (d *VideoDownloadInfo) BestURL() string {
	for _, u := range []string{d.NoWatermarkDownloadURL, d.DownloadURL, d.PlayURL} {
		if u != "" {
			return u
		}
	}
	return ""
}

// GetVideoDownloadURL 实时取一条视频的下载地址(url 可传 video_id)。
// realtime 端点可能因风控返回 code=500(不消耗调用额度),遇到则指数退避重试。
// 成功返回的地址有时效,调用方须立即下载。
func (c *Client) GetVideoDownloadURL(ctx context.Context, videoID, region string) (*VideoDownloadInfo, error) {
	const maxAttempts = 3
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 2 * time.Second):
			}
		}
		var env Envelope[VideoDownloadInfo]
		if err := c.call(ctx, "/realtime/video/download-url", map[string]string{"url": videoID, "region": region}, &env); err != nil {
			lastErr = err
			continue
		}
		if env.Code == 500 { // 风控,可安全重试(不消耗额度)
			lastErr = fmt.Errorf("echotik code 500(风控): %s", env.Message)
			continue
		}
		if env.Code != 0 && env.Code != 200 {
			return nil, fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
		}
		return &env.Data, nil
	}
	return nil, lastErr
}
