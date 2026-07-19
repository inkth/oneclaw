package service

import (
	"context"
	"sync"

	"github.com/google/uuid"

	"github.com/faxianmao/server/internal/logger"
)

// ── 任务增量广播 ─────────────────────────────────────────────────────────────
//
// execute 在后台 goroutine 里跑,派活的那个 HTTP 请求早就返回了 —— 所以增量没法顺着
// 原连接回去,得进程内中转一道:execute 边跑边 push,SSE 端点按任务 ID 订阅。
//
// 进程内内存态,够用是因为生产只有一个 go-api 容器(docker-compose.prod.yml 无 replicas)。
// 将来 go-api 要横向扩,这里必须换 Redis pub/sub 或按任务 ID 粘性路由,否则订阅会落到
// 没在跑该任务的实例上、永远收不到增量(前端会静默退化成轮询,不报错,难查)。

// streamTextCap 单条任务累积正文上限(字节)。顾问 8000 token 约 32KB,留足余量;
// 超出即停止累积,防跑飞的模型把内存吃穿。
const streamTextCap = 512 * 1024

// taskStream 一条任务的实时正文。text 全量累积(而不是只转发瞬时增量),
// 这样晚订阅的客户端能一次性补齐已经吐出去的部分 —— 前端开 SSE 必然晚于任务开跑。
type taskStream struct {
	mu       sync.Mutex
	text     []byte
	subs     map[chan struct{}]struct{}
	done     bool
	capHit   bool
	capLogID uuid.UUID
}

type streamHub struct {
	mu      sync.Mutex
	streams map[uuid.UUID]*taskStream
}

func newStreamHub() *streamHub {
	return &streamHub{streams: map[uuid.UUID]*taskStream{}}
}

// begin 为任务开一条流,返回给 execute 用的推送函数。重复 begin 复用同一条。
func (h *streamHub) begin(taskID uuid.UUID) func(string) {
	h.mu.Lock()
	ts, ok := h.streams[taskID]
	if !ok {
		ts = &taskStream{subs: map[chan struct{}]struct{}{}, capLogID: taskID}
		h.streams[taskID] = ts
	}
	h.mu.Unlock()
	return ts.push
}

func (ts *taskStream) push(delta string) {
	if delta == "" {
		return
	}
	ts.mu.Lock()
	if len(ts.text)+len(delta) > streamTextCap {
		if !ts.capHit {
			ts.capHit = true
			logger.Warn("[agent] 任务正文超出流式缓冲上限,后续增量不再广播",
				logger.String("task", ts.capLogID.String()))
		}
		ts.mu.Unlock()
		return
	}
	ts.text = append(ts.text, delta...)
	subs := make([]chan struct{}, 0, len(ts.subs))
	for ch := range ts.subs {
		subs = append(subs, ch)
	}
	ts.mu.Unlock()
	// 非阻塞唤醒:信号channel 容量 1,订阅者慢也不会把生成卡住(正文本身在 text 里不会丢)。
	for _, ch := range subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// finish 标记任务收尾并唤醒所有订阅者。必须在任务终态落库之后调用 ——
// 否则订阅者收到 done 后回查 DB,可能读到还没写完的中间态。
func (h *streamHub) finish(taskID uuid.UUID) {
	h.mu.Lock()
	ts, ok := h.streams[taskID]
	delete(h.streams, taskID) // 从索引摘除;在飞的 cursor 持有指针,仍能读到收尾信号
	h.mu.Unlock()
	if !ok {
		return
	}
	ts.mu.Lock()
	ts.done = true
	subs := make([]chan struct{}, 0, len(ts.subs))
	for ch := range ts.subs {
		subs = append(subs, ch)
	}
	ts.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// TaskStreamCursor 一个订阅者的读游标。按已读偏移量取增量,慢订阅者只会晚拿、不会丢字。
type TaskStreamCursor struct {
	ts   *taskStream
	wake chan struct{}
	sent int
}

// subscribe 订阅任务的实时正文。ok=false 表示这条任务当前没有在跑的流
// (未开始 / 已结束 / 该 Agent 本就不流式),调用方应回落到读库。
func (h *streamHub) subscribe(taskID uuid.UUID) (*TaskStreamCursor, bool) {
	h.mu.Lock()
	ts, ok := h.streams[taskID]
	h.mu.Unlock()
	if !ok {
		return nil, false
	}
	cur := &TaskStreamCursor{ts: ts, wake: make(chan struct{}, 1)}
	ts.mu.Lock()
	ts.subs[cur.wake] = struct{}{}
	ts.mu.Unlock()
	return cur, true
}

// Read 取自上次以来的新增正文。done=true 表示不会再有新内容。
// 首次调用会一次性返回订阅之前已经积累的全部正文(补齐晚订阅的落差)。
func (c *TaskStreamCursor) Read() (string, bool) {
	c.ts.mu.Lock()
	defer c.ts.mu.Unlock()
	if c.sent < len(c.ts.text) {
		chunk := string(c.ts.text[c.sent:])
		c.sent = len(c.ts.text)
		return chunk, c.ts.done
	}
	return "", c.ts.done
}

// Wake 有新增内容或任务收尾时被唤醒(容量 1,非阻塞投递)。
func (c *TaskStreamCursor) Wake() <-chan struct{} { return c.wake }

func (c *TaskStreamCursor) Close() {
	c.ts.mu.Lock()
	delete(c.ts.subs, c.wake)
	c.ts.mu.Unlock()
}

// SubscribeTask 校验任务归属后订阅其实时正文。live=false 表示当前无流可订(任务已结束、
// 或该 Agent 不产生 token 流),调用方应改为读库拿终态。用完必须 Close()。
func (s *AgentService) SubscribeTask(ctx context.Context, wsID, taskID uuid.UUID) (*TaskStreamCursor, bool, error) {
	if _, err := s.Get(ctx, wsID, taskID); err != nil {
		return nil, false, err
	}
	cur, ok := s.stream.subscribe(taskID)
	return cur, ok, nil
}
