package llm

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/faxianmao/server/internal/logger"
)

func TestMain(m *testing.M) {
	_ = logger.Init("debug") // 全局 logger,否则流式路径上的 logger.Warn 解引用 nil panic
	os.Exit(m.Run())
}

// sseServer 起一个吐固定 SSE 正文的假上游,并返回指向它的已构造请求。
func sseServer(t *testing.T, status int, body string) (*Client, *http.Request) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	req, err := http.NewRequest(http.MethodPost, srv.URL, strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	return &Client{streamHTTP: &http.Client{}}, req
}

func TestDoStreamAccumulatesDeltasAndUsage(t *testing.T) {
	// 混入上游真实会发的保活注释行与空行,确认解析不被它们带偏。
	body := ": OPENROUTER PROCESSING\n\n" +
		`data: {"choices":[{"delta":{"content":"选品"}}]}` + "\n\n" +
		": OPENROUTER PROCESSING\n" +
		`data: {"choices":[{"delta":{"content":"建议:"}}]}` + "\n\n" +
		`data: {"choices":[{"delta":{"content":"先看毛利"}}]}` + "\n\n" +
		// 按顾问长回答的真实量级给(8000 token 预算)。小数量级下 deepseek 单价本就
		// 不足 1 分、四舍五入合法地等于 0,拿它断言成本会得出错误结论。
		`data: {"choices":[],"usage":{"prompt_tokens":2000,"completion_tokens":6000}}` + "\n\n" +
		"data: [DONE]\n\n"

	c, req := sseServer(t, http.StatusOK, body)
	var seen []string
	res, err := c.doStream(req, "deepseek/deepseek-v4-pro", 2000, func(d string) {
		seen = append(seen, d)
	})
	if err != nil {
		t.Fatalf("doStream 返回错误: %v", err)
	}
	if want := "选品建议:先看毛利"; res.Content != want {
		t.Errorf("累积正文 = %q, want %q", res.Content, want)
	}
	// 逐段回调是流式的全部意义所在:合并成一次回调等于没做。
	if len(seen) != 3 {
		t.Errorf("onDelta 回调 %d 次, want 3 (逐段吐): %q", len(seen), seen)
	}
	if res.Usage.TokensIn != 2000 || res.Usage.TokensOut != 6000 {
		t.Errorf("usage = in:%d out:%d, want in:2000 out:6000", res.Usage.TokensIn, res.Usage.TokensOut)
	}
	// usage 没接住的话成本会静默记 0(生产踩过的静默降级),这里锁死它确实被换算过。
	if want := estimateCostCents("deepseek/deepseek-v4-pro", 2000, 6000); res.Usage.CostCents != want {
		t.Errorf("CostCents = %d, want %d —— usage 没喂进 estimateCostCents", res.Usage.CostCents, want)
	}
	if res.Usage.Model != "deepseek/deepseek-v4-pro" {
		t.Errorf("Usage.Model = %q,未回填", res.Usage.Model)
	}
}

// 空正文必须当失败 —— 与非流式同一条防线(reasoning 模型烧光 max_tokens 时会这样),
// 否则调用点会把空串当成品落库。
func TestDoStreamEmptyBodyIsError(t *testing.T) {
	body := `data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":0}}` + "\n\n" +
		"data: [DONE]\n\n"
	c, req := sseServer(t, http.StatusOK, body)
	if _, err := c.doStream(req, "m", 2000, func(string) {}); err == nil {
		t.Fatal("空正文应当报错,实际返回了成功")
	}
}

// 流中途出现 error 帧(上游地区限制/额度)必须中断并报错,不能把半截答案当成品。
func TestDoStreamUpstreamErrorFrame(t *testing.T) {
	body := `data: {"choices":[{"delta":{"content":"开头"}}]}` + "\n\n" +
		`data: {"error":{"message":"No endpoints found"}}` + "\n\n"
	c, req := sseServer(t, http.StatusOK, body)
	_, err := c.doStream(req, "m", 2000, func(string) {})
	if err == nil {
		t.Fatal("上游 error 帧应当报错")
	}
	if !strings.Contains(err.Error(), "No endpoints found") {
		t.Errorf("错误未透传上游原文: %v", err)
	}
}

// 非 200 时上游回的是普通 JSON 错误体而不是流,得按错误体解析。
func TestDoStreamNon200(t *testing.T) {
	c, req := sseServer(t, http.StatusForbidden, `{"error":{"message":"region blocked"}}`)
	_, err := c.doStream(req, "m", 2000, func(string) {})
	if err == nil || !strings.Contains(err.Error(), "region blocked") {
		t.Fatalf("403 应带上游原因, got %v", err)
	}
}
