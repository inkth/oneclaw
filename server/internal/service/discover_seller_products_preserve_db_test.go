package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// 跑法同 discover_backfill_db_test.go:设 FAXIANMAO_TEST_DB_DSN，否则 skip。
//
// TestSellerProductsPreservedOnFetchError 商品列表拉失败时不得清空既有列表:
// 详情本身成功 → 照常落库;products 列保留上一次的好数据,而不是被空数组覆盖
// (被覆盖的话「店铺热销商品」卡会整块消失,且 detail_fetched_at 已刷新,要冻 72h)。
func TestSellerProductsPreservedOnFetchError(t *testing.T) {
	db := openTestDB(t)

	var failProducts atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/echotik/seller/detail":
			// 照 medicube US Store 实况:只给 total_product_cnt,不给 total_crawl_product_cnt。
			writeEnv(w, []echotik.SellerDetail{{
				SellerID: "s-1", SellerName: "medicube US Store", Rating: 4.6,
				TotalSaleCnt: 6946606, TotalProductCnt: 254,
			}})
		case "/echotik/seller/product/list":
			if failProducts.Load() {
				http.Error(w, "upstream boom", http.StatusInternalServerError)
				return
			}
			writeEnv(w, []echotik.EntityProduct{
				{ProductID: "p-1", ProductName: "好商品"},
				{ProductID: "p-2", ProductName: "另一个"},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	svc := NewDiscoverService(db, echotik.New(config.EchoTikConfig{
		BaseURL: srv.URL, Username: "u", Password: "p",
	}), nil, nil, 0)
	ctx := context.Background()

	// 第一轮:商品列表正常 → 落库 2 条。
	if _, err := svc.refreshSellerDetail(ctx, "s-1", "US"); err != nil {
		t.Fatalf("首轮刷新失败: %v", err)
	}
	if got := storedSellerProducts(t, db); len(got) != 2 {
		t.Fatalf("首轮应落 2 条商品,得到 %d", len(got))
	}

	// 第二轮:商品列表 500,详情仍成功 → 既有 2 条必须原样保留。
	failProducts.Store(true)
	if _, err := svc.refreshSellerDetail(ctx, "s-1", "US"); err != nil {
		t.Fatalf("商品列表失败不应连坐详情刷新: %v", err)
	}
	got := storedSellerProducts(t, db)
	if len(got) != 2 {
		t.Errorf("商品列表拉失败后既有列表被覆盖成 %d 条,期望保留 2 条", len(got))
	}
	// 详情字段照常写入,证明不是整轮回滚。
	var ds model.DiscoverSeller
	db.Where("external_id = ? AND region = ?", "s-1", "US").First(&ds)
	if ds.CrawlProductCnt != 254 {
		t.Errorf("详情字段应照常落库(crawl=254),得到 %d", ds.CrawlProductCnt)
	}
	if ds.DetailFetchedAt.IsZero() {
		t.Error("detail_fetched_at 应已写入")
	}
}

func storedSellerProducts(t *testing.T, db *gorm.DB) []EntityProductDTO {
	t.Helper()
	var ds model.DiscoverSeller
	if err := db.Where("external_id = ? AND region = ?", "s-1", "US").First(&ds).Error; err != nil {
		t.Fatalf("读店铺行失败: %v", err)
	}
	return parseEntityProducts(ds.Products)
}
