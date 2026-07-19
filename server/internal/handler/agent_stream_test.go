package handler

import (
	"bufio"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// 这两条锁的是 SSE 赖以成立的基础设施假设 —— 它们一旦不成立，代码照跑、测试照过、
// 前端也不报错，只是「流式」悄悄退化成「等半天一次性出现」。正因为失败是静默的，
// 才必须显式钉住。
//
// 假设一：gin 的 c.Stream/SSEvent 每次返回都真的 flush 到网络，而不是攒着。
// 假设二：gin v1.10 的 responseWriter 实现了 Unwrap()，因此 http.NewResponseController
//
//	能拿到底层连接、解除 Server.WriteTimeout —— 否则顾问的长回答会在 60s 被腰斩
//	(cmd/main.go 设的就是 60s，而顾问能跑到 150s)。
func startSSEServer(t *testing.T, h gin.HandlerFunc) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/stream", h)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("监听失败: %v", err)
	}
	// 与生产同构:全局 WriteTimeout 60s(cmd/main.go)。
	srv := &http.Server{Handler: r, WriteTimeout: 60 * time.Second}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })
	return "http://" + ln.Addr().String() + "/stream"
}

// 增量必须边产生边到达。若 gin 攒着不 flush,三段会一起到,间隔近 0 —— 那就等于没做流式。
func TestSSEFlushesIncrementally(t *testing.T) {
	url := startSSEServer(t, func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		i := 0
		c.Stream(func(io.Writer) bool {
			if i >= 3 {
				c.SSEvent("done", gin.H{})
				return false
			}
			i++
			c.SSEvent("delta", gin.H{"text": "块"})
			time.Sleep(60 * time.Millisecond)
			return true
		})
	})

	res, err := http.Get(url)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	defer res.Body.Close()

	start := time.Now()
	var arrivals []time.Duration
	sc := bufio.NewScanner(res.Body)
	for sc.Scan() {
		if strings.HasPrefix(sc.Text(), "event:delta") || strings.HasPrefix(sc.Text(), "event: delta") {
			arrivals = append(arrivals, time.Since(start))
		}
	}
	if len(arrivals) != 3 {
		t.Fatalf("收到 %d 个 delta, want 3", len(arrivals))
	}
	// 全部挤在一起 = 被缓冲了。留足余量,只要求最后一个明显晚于第一个。
	if gap := arrivals[2] - arrivals[0]; gap < 80*time.Millisecond {
		t.Errorf("三段增量几乎同时到达(间隔 %v),说明响应被缓冲、并没有真的流式", gap)
	}
}

// 钉住前后端的线格式契约:前端按 event 名分发、再 JSON.parse(e.data).text。
// 顾问回的是 markdown,含换行和中文 —— 换行若被编码成多行 data: 就会把 JSON 劈两半、
// 前端 parse 直接失败(而且是 try/catch 静默吞掉的那种失败)。
func TestSSEDeltaWireFormat(t *testing.T) {
	const payload = "### 起步路线\n\n1. 先看毛利\n2. 再谈物流"
	url := startSSEServer(t, func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		c.SSEvent("delta", gin.H{"text": payload})
	})

	res, err := http.Get(url)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	body := string(raw)

	if !strings.Contains(body, "event:delta") && !strings.Contains(body, "event: delta") {
		t.Fatalf("没有 delta 事件名,前端的 addEventListener 收不到:\n%q", body)
	}
	// 多行正文必须仍是单行 data:(JSON 把换行转义成 \n),否则前端 JSON.parse 会炸。
	var dataLines []string
	for _, ln := range strings.Split(body, "\n") {
		if after, ok := strings.CutPrefix(ln, "data:"); ok {
			dataLines = append(dataLines, strings.TrimSpace(after))
		}
	}
	if len(dataLines) != 1 {
		t.Fatalf("data: 行数 = %d, want 1(多行会把 JSON 劈开):\n%q", len(dataLines), body)
	}
	var got struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal([]byte(dataLines[0]), &got); err != nil {
		t.Fatalf("前端 JSON.parse 会失败: %v (data=%q)", err, dataLines[0])
	}
	if got.Text != payload {
		t.Errorf("正文往返后不一致:\ngot  %q\nwant %q", got.Text, payload)
	}
}

// 解除写超时必须真的生效:拿不到底层连接的话,长回答会在 WriteTimeout 处被切断。
func TestSSECanClearWriteDeadline(t *testing.T) {
	var ctrlErr error
	url := startSSEServer(t, func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		ctrlErr = http.NewResponseController(c.Writer).SetWriteDeadline(time.Time{})
		c.SSEvent("done", gin.H{})
	})

	res, err := http.Get(url)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	defer res.Body.Close()
	_, _ = res.Body.Read(make([]byte, 1))

	if ctrlErr != nil {
		t.Fatalf("SetWriteDeadline 失败(gin 的 ResponseWriter 没能 Unwrap 到底层连接):%v\n"+
			"→ 顾问长回答会在 Server.WriteTimeout(60s)被腰斩,须改用其他方式放宽该路由的写超时", ctrlErr)
	}
}
