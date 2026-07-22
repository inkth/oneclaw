package llm

import (
	"testing"

	"github.com/faxianmao/server/internal/config"
)

func TestVisionPartsSkipsBlankURLs(t *testing.T) {
	parts := visionParts("看看这个商品", []string{" https://example.com/a.jpg ", " ", "https://example.com/b.png"})
	if len(parts) != 3 {
		t.Fatalf("visionParts() length = %d, want 3", len(parts))
	}
	if parts[0]["type"] != "text" || parts[0]["text"] != "看看这个商品" {
		t.Fatalf("unexpected text part: %#v", parts[0])
	}
	image, ok := parts[1]["image_url"].(map[string]string)
	if !ok || image["url"] != "https://example.com/a.jpg" {
		t.Fatalf("unexpected first image part: %#v", parts[1])
	}
}

func TestEstimateCostCentsQwen37Plus(t *testing.T) {
	// $0.32 input + $1.28 output for one million tokens each = $1.60.
	if got := estimateCostCents("qwen/qwen3.7-plus", 1_000_000, 1_000_000); got != 160 {
		t.Fatalf("estimateCostCents() = %d, want 160", got)
	}
}

func TestEstimateCostCentsMiniMaxM3(t *testing.T) {
	// $0.30 input + $1.20 output for one million tokens each = $1.50.
	if got := estimateCostCents("minimax/minimax-m3", 1_000_000, 1_000_000); got != 150 {
		t.Fatalf("estimateCostCents() = %d, want 150", got)
	}
}

func TestVideoModelForAltGrayscale(t *testing.T) {
	c := &Client{cfg: config.OpenRouterConfig{
		VideoModel:              "bytedance/seedance-2.0-fast",
		VideoModelAlt:           "alibaba/wan-2.6",
		VideoModelAltWorkspaces: []string{"ws-a", "ws-b"},
	}}
	if got := c.VideoModelFor("ws-a"); got != "alibaba/wan-2.6" {
		t.Fatalf("灰度名单内应用备选模型, got %q", got)
	}
	if got := c.VideoModelFor("ws-c"); got != "bytedance/seedance-2.0-fast" {
		t.Fatalf("名单外应用默认模型, got %q", got)
	}
	// 备选模型未配置时,名单形同虚设,一律默认模型。
	c.cfg.VideoModelAlt = ""
	if got := c.VideoModelFor("ws-a"); got != "bytedance/seedance-2.0-fast" {
		t.Fatalf("备选模型为空应回落默认, got %q", got)
	}
}
