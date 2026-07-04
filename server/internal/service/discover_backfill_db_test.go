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

// 跑法:ONECLAW_TEST_DB_DSN="host=localhost port=5432 user=... dbname=oneclaw_backfill_test sslmode=disable" \
//   go test ./internal/service/ -run TestBackfill -v
// 不设 DSN 则 skip(沙箱无 PG)。用假 EchoTik HTTP 服务,无需真实凭证/网络。

func TestMain(m *testing.M) {
	_ = logger.Init("debug") // 全局 logger,否则 logger.Info 解引用 nil panic
	os.Exit(m.Run())
}

func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("ONECLAW_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("ONECLAW_TEST_DB_DSN 未设置,跳过 DB 集成测试")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接测试库失败: %v", err)
	}
	// 干净起步:重建相关表,保证可重复。
	_ = db.Migrator().DropTable(
		&model.DiscoverProduct{}, &model.DiscoverBackfillCursor{}, &model.EntityRanklistEntry{},
		&model.DiscoverSeller{}, &model.DiscoverSellerSnapshot{}, &model.CoverAsset{},
	)
	if err := db.AutoMigrate(
		&model.DiscoverProduct{}, &model.DiscoverBackfillCursor{}, &model.EntityRanklistEntry{},
		&model.DiscoverSeller{}, &model.DiscoverSellerSnapshot{}, &model.CoverAsset{},
	); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	return db
}

// fakePages 第 1/2 页满 10 条,第 3 页 3 条(触发提前收尾),其余空。
var fakePages = map[string]int{"1": 10, "2": 10, "3": 3}

// TestBackfillProducts 商品榜回填:分页落库 + 游标推进 + 重跑跳过已完成(已有数据不再请求)。
func TestBackfillProducts(t *testing.T) {
	db := openTestDB(t)
	orig := backfillReqInterval
	backfillReqInterval = time.Millisecond
	defer func() { backfillReqInterval = orig }()
	t.Setenv("BACKFILL_PRODUCTS_REGIONS", "US")

	var ranklistReqs int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/echotik/category/l1":
			writeEnv(w, []echotik.Category{{CategoryID: "601152", CategoryName: "美妆个护"}})
		case "/echotik/product/ranklist":
			atomic.AddInt64(&ranklistReqs, 1)
			page := r.URL.Query().Get("page_num")
			n := fakePages[page]
			out := make([]echotik.ProductListItem, 0, n)
			for i := 0; i < n; i++ {
				out = append(out, echotik.ProductListItem{
					ProductID: fmt.Sprintf("p-%s-%d", page, i), ProductName: "商品", Region: "US",
					CategoryID: "601152", MinPrice: 9.9, MaxPrice: 19.9, SpuAvgPrice: 14.9, TotalSaleCnt: 100,
				})
			}
			writeEnv(w, out)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	svc := NewDiscoverService(db, echotik.New(config.EchoTikConfig{BaseURL: srv.URL, Username: "u", Password: "p"}), nil, nil)

	// 第一轮:第 3 页不足 10 条 => 提前收尾;10+10+3=23。
	fetched, skipped, err := svc.BackfillDiscover(context.Background(), BackfillKindsProductOnly)
	if err != nil {
		t.Fatalf("回填失败: %v", err)
	}
	if fetched != 23 || skipped != 0 {
		t.Errorf("第一轮 fetched=%d skipped=%d, 期望 23/0", fetched, skipped)
	}
	if got := atomic.LoadInt64(&ranklistReqs); got != 3 {
		t.Errorf("第一轮商品榜请求=%d, 期望 3", got)
	}
	var cnt int64
	db.Model(&model.DiscoverProduct{}).
		Where("region = ? AND category_id = ?", "US", "601152").Count(&cnt)
	if cnt != 23 {
		t.Errorf("库内商品数=%d, 期望 23", cnt)
	}
	var cur model.DiscoverBackfillCursor
	db.Where("kind = ? AND region = ? AND category_id = ?", boardProduct, "US", "601152").First(&cur)
	if cur.DonePages != 3 || !cur.Completed {
		t.Errorf("游标 donePages=%d completed=%v, 期望 3/true", cur.DonePages, cur.Completed)
	}

	// 第二轮:已 completed,整组跳过,不再请求。
	before := atomic.LoadInt64(&ranklistReqs)
	f2, sk2, _ := svc.BackfillDiscover(context.Background(), BackfillKindsProductOnly)
	if f2 != 0 || sk2 != 1 {
		t.Errorf("第二轮 fetched=%d skipped=%d, 期望 0/1(已有数据不再请求)", f2, sk2)
	}
	if got := atomic.LoadInt64(&ranklistReqs); got != before {
		t.Errorf("第二轮请求从 %d 涨到 %d, 期望不变", before, got)
	}
}

// TestBackfillSellerReadPath 店铺榜回填覆盖「全部类目 + 具体类目」×多页,且读路径按类目/页读本地。
func TestBackfillSellerReadPath(t *testing.T) {
	db := openTestDB(t)
	orig := backfillReqInterval
	backfillReqInterval = time.Millisecond
	defer func() { backfillReqInterval = orig }()
	t.Setenv("BACKFILL_PRODUCTS_REGIONS", "US")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/echotik/category/l1":
			writeEnv(w, []echotik.Category{{CategoryID: "601152", CategoryName: "美妆个护"}})
		case "/echotik/seller/ranklist":
			page := r.URL.Query().Get("page_num")
			n := fakePages[page]
			out := make([]echotik.SellerListItem, 0, n)
			for i := 0; i < n; i++ {
				out = append(out, echotik.SellerListItem{
					SellerID: fmt.Sprintf("s-%s-%d", page, i), SellerName: "店铺", Region: "US",
					TotalProductCnt: 5, TotalSaleCnt: 100,
				})
			}
			writeEnv(w, out)
		case "/echotik/batch/cover/download":
			writeEnv(w, []map[string]string{}) // 无封面签名,避免噪声
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	svc := NewDiscoverService(db, echotik.New(config.EchoTikConfig{BaseURL: srv.URL, Username: "u", Password: "p"}), nil, nil)

	if _, _, err := svc.BackfillDiscover(context.Background(), []string{boardSeller}); err != nil {
		t.Fatalf("店铺回填失败: %v", err)
	}

	// 店铺主表落库:同一 (page,i) 跨「全部/类目」组合 id 相同 → 去重后 23 个 distinct。
	var sellers int64
	db.Model(&model.DiscoverSeller{}).Where("region = ?", "US").Count(&sellers)
	if sellers != 23 {
		t.Errorf("店铺主表行数=%d, 期望 23", sellers)
	}

	// 顺序表:全部类目("") + 类目(601152) 各 3 页 = 6 条。
	var entries int64
	db.Model(&model.EntityRanklistEntry{}).Where("kind = ? AND region = ?", boardSeller, "US").Count(&entries)
	if entries != 6 {
		t.Errorf("顺序表条数=%d, 期望 6", entries)
	}

	// 读路径:类目 601152 第 2 页应命中本地(cached),返回该页 10 行。
	p := echotik.RanklistParams{
		Region: "US", RankType: echotik.RankHot, RankField: echotik.EntityFieldSales,
		CategoryID: "601152", PageNum: 2, PageSize: 20,
	}
	res := svc.SellerRanklist(context.Background(), p)
	if res.State != "cached" {
		t.Errorf("类目第2页 state=%q, 期望 cached(读本地)", res.State)
	}
	if len(res.Rows) != 10 {
		t.Errorf("类目第2页行数=%d, 期望 10", len(res.Rows))
	}
	// 第 1 页同样本地命中。
	p.PageNum = 1
	if r1 := svc.SellerRanklist(context.Background(), p); r1.State != "cached" || len(r1.Rows) != 10 {
		t.Errorf("类目第1页 state=%q rows=%d, 期望 cached/10", r1.State, len(r1.Rows))
	}
}

// TestEntityRanklistIndexMigration 模拟生产:已存在旧 6 列唯一索引 uq_ere_key,验证
// 「DROP 旧索引 + AutoMigrate」后:page_num 列补上(存量行回填为 1)、新索引 uq_ere_pg 生效
//(同 6 列不同页可共存,同 7 列冲突),旧索引消失。
func TestEntityRanklistIndexMigration(t *testing.T) {
	db := openTestDB(t)
	_ = db.Migrator().DropTable(&model.EntityRanklistEntry{})

	// 1. 造旧态:无 page_num,唯一索引在 6 列上。
	if err := db.Exec(`CREATE TABLE entity_ranklist_entries (
		id uuid PRIMARY KEY, provider text NOT NULL, kind text NOT NULL, region text NOT NULL,
		rank_type int NOT NULL, rank_field int NOT NULL, category_id text NOT NULL DEFAULT '',
		external_ids text, fetched_at timestamptz)`).Error; err != nil {
		t.Fatalf("建旧表失败: %v", err)
	}
	db.Exec(`CREATE UNIQUE INDEX uq_ere_key ON entity_ranklist_entries
		(provider,kind,region,rank_type,rank_field,category_id)`)
	db.Exec(`INSERT INTO entity_ranklist_entries
		(id,provider,kind,region,rank_type,rank_field,category_id,external_ids)
		VALUES (gen_random_uuid(),'echotik','seller','US',1,1,'','["a","b"]')`)

	// 2. 走 main.go 的迁移步骤。
	db.Exec("DROP INDEX IF EXISTS uq_ere_key")
	if err := db.AutoMigrate(&model.EntityRanklistEntry{}); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}

	// 3a. 存量行 page_num 回填为 1。
	var legacy model.EntityRanklistEntry
	db.Where("kind = ? AND region = ?", "seller", "US").First(&legacy)
	if legacy.PageNum != 1 {
		t.Errorf("存量行 page_num=%d, 期望 1", legacy.PageNum)
	}
	// 3b. 旧索引已不在。
	var oldIdx int64
	db.Raw("SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_ere_key'").Scan(&oldIdx)
	if oldIdx != 0 {
		t.Errorf("旧索引 uq_ere_key 仍存在")
	}
	// 3c. 同 6 列不同页可共存(page2 不与 page1 冲突)。
	if err := db.Create(&model.EntityRanklistEntry{
		Provider: providerEchoTik, Kind: "seller", Region: "US", RankType: 1, RankField: 1,
		CategoryID: "", PageNum: 2, ExternalIDs: []string{"c"}, FetchedAt: time.Now(),
	}).Error; err != nil {
		t.Errorf("page2 应可插入(新索引含 page_num): %v", err)
	}
	var total int64
	db.Model(&model.EntityRanklistEntry{}).Where("kind = ? AND region = ?", "seller", "US").Count(&total)
	if total != 2 {
		t.Errorf("迁移后行数=%d, 期望 2(page1 存量 + page2 新插)", total)
	}
}

func writeEnv[T any](w http.ResponseWriter, data T) {
	_ = json.NewEncoder(w).Encode(echotik.Envelope[T]{Code: 0, Data: data})
}
