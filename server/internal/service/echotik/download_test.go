package echotik

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/faxianmao/server/internal/config"
)

// 首次风控 code=500 应重试;取址优先无水印;并透传字段。
func TestGetVideoDownloadURL_RetryAndBestURL(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if atomic.AddInt32(&calls, 1) == 1 {
			_, _ = w.Write([]byte(`{"code":500,"message":"风控","data":{}}`))
			return
		}
		_, _ = w.Write([]byte(`{"code":0,"message":"ok","data":{"video_id":"v1","no_watermark_download_url":"https://cdn/nw.mp4","download_url":"https://cdn/dl.mp4","play_url":"https://cdn/play.mp4"}}`))
	}))
	defer srv.Close()

	c := New(config.EchoTikConfig{BaseURL: srv.URL, Username: "u", Password: "p"})
	info, err := c.GetVideoDownloadURL(context.Background(), "v1", "US")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got := info.BestURL(); got != "https://cdn/nw.mp4" {
		t.Fatalf("BestURL = %q, 期望优先无水印地址", got)
	}
	if calls < 2 {
		t.Fatalf("code=500 应触发重试,calls=%d", calls)
	}
}

func TestVideoDownloadInfo_BestURLFallback(t *testing.T) {
	// 无水印为空时回落普通下载地址。
	d := &VideoDownloadInfo{DownloadURL: "https://cdn/dl.mp4", PlayURL: "https://cdn/play.mp4"}
	if got := d.BestURL(); got != "https://cdn/dl.mp4" {
		t.Fatalf("BestURL = %q, 期望回落 download_url", got)
	}
	if got := (&VideoDownloadInfo{}).BestURL(); got != "" {
		t.Fatalf("BestURL = %q, 期望空", got)
	}
}
