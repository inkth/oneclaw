package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/oneclaw/server/internal/config"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

func TestMain(m *testing.M) {
	_ = logger.Init("debug") // 全局 logger,否则 logger.Info 解引用 nil panic
	os.Exit(m.Run())
}

// 跑法:ONECLAW_TEST_DB_DSN="host=localhost port=5432 user=... dbname=oneclaw_backfill_test sslmode=disable" \
//   go test ./internal/service/ -run TestBackfillAllProducts -v
// 不设 DSN 则 skip(沙箱无 PG)。用假 EchoTik HTTP 服务,无需真实凭证/网络。
func TestBackfillAllProducts(t *testing.T) {
	dsn := os.Getenv("ONECLAW_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("ONECLAW_TEST_DB_DSN 未设置,跳过 DB 集成测试")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接测试库失败: %v", err)
	}
	// 干净起步:每次重建相关表,保证可重复。
	_ = db.Migrator().DropTable(&model.DiscoverProduct{}, &model.DiscoverBackfillCursor{})
	if err := db.AutoMigrate(&model.DiscoverProduct{}, &model.DiscoverBackfillCursor{}); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}

	// 限速调小,避免干等。
	orig := backfillReqInterval
	backfillReqInterval = time.Millisecond
	defer func() { backfillReqInterval = orig }()

	// 只跑单站点单类目,缩小范围。
	t.Setenv("BACKFILL_PRODUCTS_REGIONS", "US")

	var ranklistReqs int64 // 商品榜请求计数(验证重跑不再请求)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/echotik/category/l1":
			// 单一类目,缩小组合数。
			writeEnv(w, []echotik.Category{{CategoryID: "601152", CategoryName: "美妆个护"}})
		case "/echotik/product/ranklist":
			atomic.AddInt64(&ranklistReqs, 1)
			page := r.URL.Query().Get("page_num")
			items := fakeRanklistPage(page)
			writeEnv(w, items)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	echo := echotik.New(config.EchoTikConfig{
		BaseURL: srv.URL, Username: "u", Password: "p",
	})
	if !echo.Configured() {
		t.Fatal("假 echo client 应为 Configured")
	}
	svc := NewDiscoverService(db, echo, nil)

	// —— 第一轮:应拉到第 3 页(第 3 页不足 10 条 => 提前收尾)——
	fetched, skipped, err := svc.BackfillAllProducts(context.Background())
	if err != nil {
		t.Fatalf("回填失败: %v", err)
	}
	// 10 + 10 + 3 = 23 条
	if fetched != 23 {
		t.Errorf("第一轮 fetched=%d, 期望 23", fetched)
	}
	if skipped != 0 {
		t.Errorf("第一轮 skipped=%d, 期望 0", skipped)
	}
	// 类目调用 1 次 + 商品榜 3 页 = 商品榜请求 3 次。
	if got := atomic.LoadInt64(&ranklistReqs); got != 3 {
		t.Errorf("第一轮商品榜请求=%d, 期望 3", got)
	}

	// 落库校验:23 条 distinct 商品,且都带本站点+类目。
	var cnt int64
	db.Model(&model.DiscoverProduct{}).
		Where("provider = ? AND region = ? AND category_id = ?", providerEchoTik, "US", "601152").
		Count(&cnt)
	if cnt != 23 {
		t.Errorf("库内商品数=%d, 期望 23", cnt)
	}

	// 游标:donePages=3, completed=true。
	var cur model.DiscoverBackfillCursor
	if err := db.Where("region = ? AND category_id = ?", "US", "601152").First(&cur).Error; err != nil {
		t.Fatalf("读游标失败: %v", err)
	}
	if cur.DonePages != 3 || !cur.Completed {
		t.Errorf("游标 donePages=%d completed=%v, 期望 3/true", cur.DonePages, cur.Completed)
	}

	// —— 第二轮:组合已 completed,应整组跳过,不再发任何商品榜请求 ——
	reqBefore := atomic.LoadInt64(&ranklistReqs)
	fetched2, skipped2, err := svc.BackfillAllProducts(context.Background())
	if err != nil {
		t.Fatalf("第二轮失败: %v", err)
	}
	if fetched2 != 0 {
		t.Errorf("第二轮 fetched=%d, 期望 0(已有数据不再请求)", fetched2)
	}
	if skipped2 != 1 {
		t.Errorf("第二轮 skipped=%d, 期望 1", skipped2)
	}
	if got := atomic.LoadInt64(&ranklistReqs); got != reqBefore {
		t.Errorf("第二轮商品榜请求从 %d 涨到 %d, 期望不变(已完成跳过)", reqBefore, got)
	}
}

func writeEnv[T any](w http.ResponseWriter, data T) {
	_ = json.NewEncoder(w).Encode(echotik.Envelope[T]{Code: 0, Data: data})
}

// fakeRanklistPage 第 1/2 页满 10 条,第 3 页 3 条(触发提前收尾),其余空。
func fakeRanklistPage(page string) []echotik.ProductListItem {
	n := map[string]int{"1": 10, "2": 10, "3": 3}[page]
	out := make([]echotik.ProductListItem, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, echotik.ProductListItem{
			ProductID:    fmt.Sprintf("p-%s-%d", page, i),
			ProductName:  fmt.Sprintf("商品 %s-%d", page, i),
			Region:       "US",
			CategoryID:   "601152",
			MinPrice:     9.9,
			MaxPrice:     19.9,
			SpuAvgPrice:  14.9,
			TotalSaleCnt: 100,
		})
	}
	return out
}
