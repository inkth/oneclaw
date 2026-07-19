package service

import (
	"sync"
	"testing"

	"github.com/google/uuid"
)

// 前端开 SSE 必然晚于任务开跑(派活返回 → 渲染 → 建连)。晚到的订阅者必须能一次性
// 补齐已经吐出去的正文,否则用户看到的回答从中间开始 —— 这是本设计的核心不变量。
func TestSubscribeReplaysEarlierText(t *testing.T) {
	h := newStreamHub()
	id := uuid.New()
	push := h.begin(id)
	push("跨境")
	push("选品")

	cur, live := h.subscribe(id)
	if !live {
		t.Fatal("任务在跑,subscribe 应当 live")
	}
	defer cur.Close()

	got, done := cur.Read()
	if got != "跨境选品" {
		t.Errorf("补齐的前缀 = %q, want %q", got, "跨境选品")
	}
	if done {
		t.Error("任务未结束,done 不该为 true")
	}

	// 补齐之后只拿增量,不重复回吐已读部分。
	push("三步走")
	got, _ = cur.Read()
	if got != "三步走" {
		t.Errorf("增量 = %q, want %q", got, "三步走")
	}
	if got, _ := cur.Read(); got != "" {
		t.Errorf("无新内容时应返回空, got %q", got)
	}
}

// 生成速度远快于订阅者读取速度时,正文一个字都不能丢 ——
// 这正是不走「channel 传字符串」而走「累积 + 偏移游标」的原因。
func TestSlowSubscriberLosesNothing(t *testing.T) {
	h := newStreamHub()
	id := uuid.New()
	push := h.begin(id)
	cur, _ := h.subscribe(id)
	defer cur.Close()

	const n = 500
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < n; i++ {
			push("x")
		}
		h.finish(id)
	}()
	wg.Wait()

	var total int
	for {
		chunk, done := cur.Read()
		total += len(chunk)
		if done {
			break
		}
	}
	if total != n {
		t.Errorf("收到 %d 字,want %d —— 有丢字", total, n)
	}
}

// finish 后订阅者必须被唤醒并读到 done,否则 SSE 连接会一直挂到超时。
func TestFinishWakesSubscriber(t *testing.T) {
	h := newStreamHub()
	id := uuid.New()
	push := h.begin(id)
	cur, _ := h.subscribe(id)
	defer cur.Close()
	push("回答")

	h.finish(id)

	select {
	case <-cur.Wake():
	default:
		t.Fatal("finish 未唤醒订阅者")
	}
	chunk, done := cur.Read()
	if chunk != "回答" {
		t.Errorf("收尾前的正文丢了: %q", chunk)
	}
	if !done {
		t.Error("finish 后 done 应为 true")
	}
}

// 任务已结束 / 该 Agent 本就不流式 → live=false,调用方回落读库。
func TestSubscribeUnknownTaskNotLive(t *testing.T) {
	h := newStreamHub()
	if _, live := h.subscribe(uuid.New()); live {
		t.Error("未开流的任务不该 live")
	}
	id := uuid.New()
	h.begin(id)
	h.finish(id)
	if _, live := h.subscribe(id); live {
		t.Error("已结束的任务不该 live(应回落读库拿终态)")
	}
}

func TestStreamableTaskCoversOnlyTextPaths(t *testing.T) {
	pid := uuid.New()
	cases := []struct {
		name  string
		agent string
		opts  AgentCreateOpts
		want  bool
	}{
		{"顾问恒流", "ADVISOR", AgentCreateOpts{}, true},
		{"选品·单品判断", "ANALYST", AgentCreateOpts{DiscoverProductID: "123"}, true},
		{"选品·工作台商品", "ANALYST", AgentCreateOpts{ProductID: &pid}, true},
		{"选品·看图", "ANALYST", AgentCreateOpts{MaterialID: &pid}, true},
		// 榜单模式产出是后端拼的文案,模型原文是用户看不到的 JSON。
		{"选品·榜单模式不流", "ANALYST", AgentCreateOpts{}, false},
		{"短视频不流", "DIRECTOR", AgentCreateOpts{}, false},
		{"Listing 不流", "LISTING", AgentCreateOpts{}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := streamableTask(tc.agent, tc.opts); got != tc.want {
				t.Errorf("streamableTask(%s) = %v, want %v", tc.agent, got, tc.want)
			}
		})
	}
}
