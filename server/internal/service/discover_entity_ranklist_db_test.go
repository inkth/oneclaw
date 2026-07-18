package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// 跑法同 discover_backfill_db_test.go:设 FAXIANMAO_TEST_DB_DSN,不设则 skip。

func openEntityTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("FAXIANMAO_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("FAXIANMAO_TEST_DB_DSN 未设置,跳过 DB 集成测试")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接测试库失败: %v", err)
	}
	tables := []any{
		&model.EntityRanklistEntry{}, &model.DiscoverInfluencer{},
		&model.DiscoverInfluencerSnapshot{}, &model.CoverAsset{},
	}
	_ = db.Migrator().DropTable(tables...)
	if err := db.AutoMigrate(tables...); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	return db
}

// influencerFake 假 EchoTik 达人榜:perPage 控制每个 EchoTik 页(10 条宽)返回几条,
// 支持中途切换成「上游当天数据没出全」的残缺形态。同时记录收到的 rank_field。
type influencerFake struct {
	mu         sync.Mutex
	perPage    map[string]int
	rankFields []string
}

func (f *influencerFake) set(perPage map[string]int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.perPage = perPage
}

func (f *influencerFake) fields() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.rankFields...)
}

func (f *influencerFake) serve(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.URL.Path != "/echotik/influencer/ranklist" {
		http.NotFound(w, r)
		return
	}
	page := r.URL.Query().Get("page_num")
	f.mu.Lock()
	n := f.perPage[page]
	f.rankFields = append(f.rankFields, r.URL.Query().Get("influencer_rank_field"))
	f.mu.Unlock()
	out := make([]echotik.InfluencerListItem, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, echotik.InfluencerListItem{
			UserID: fmt.Sprintf("inf-%s-%d", page, i), NickName: "达人", Region: "US",
			TotalFollowersHistoryCnt: 1000, TotalSaleHistoryCnt: 500,
		})
	}
	writeEnv(w, out)
}

// TestInfluencerRanklistPartialUpstreamKeepsDepth 复现并锁死线上事故:
// 顺序表已存 60 条,上游某天只回来 6 条(其余页空)时,预热不得把榜单截断成 6 条,
// 首页仍应满 20 条。
func TestInfluencerRanklistPartialUpstreamKeepsDepth(t *testing.T) {
	db := openEntityTestDB(t)
	fake := &influencerFake{perPage: map[string]int{"1": 10, "2": 10, "3": 10, "4": 10, "5": 10, "6": 10}}
	srv := httptest.NewServer(http.HandlerFunc(fake.serve))
	defer srv.Close()

	svc := NewDiscoverService(db, echotik.New(config.EchoTikConfig{BaseURL: srv.URL, Username: "u", Password: "p"}), nil, nil, 0)
	ctx := context.Background()
	p := echotik.RanklistParams{Region: "US", RankType: echotik.RankHot, PageSize: 20}

	// 健康轮:3 个前端页 × 20 = 60 条顺序 + 60 行主表。
	if err := svc.PrewarmEntities(ctx, p, 3, boardInfluencer); err != nil {
		t.Fatalf("预热失败: %v", err)
	}
	ids, _, ok := svc.lookupRanklistIDs(ctx, boardInfluencer, withField(p))
	if !ok || len(ids) != 60 {
		t.Fatalf("健康轮顺序表 ids=%d(ok=%v), 期望 60", len(ids), ok)
	}

	// 残缺轮:上游当天只出了 6 条,后续页空。
	fake.set(map[string]int{"1": 6})
	if err := svc.PrewarmEntities(ctx, p, 3, boardInfluencer); err != nil {
		t.Fatalf("残缺轮预热失败: %v", err)
	}
	ids, _, _ = svc.lookupRanklistIDs(ctx, boardInfluencer, withField(p))
	if len(ids) != 60 {
		t.Errorf("残缺轮后顺序表 ids=%d, 期望仍为 60(不得被短结果截断)", len(ids))
	}

	// 读路径首页仍满 20 条 —— 事故当天这里只剩 6 条。
	res := svc.InfluencerRanklist(ctx, withField(p))
	if len(res.Rows) != 20 {
		t.Fatalf("首页行数=%d, 期望 20", len(res.Rows))
	}
	// 新一轮的 6 条落在榜首,其余保留旧顺序。
	if res.Rows[0].UserID != "inf-1-0" {
		t.Errorf("榜首=%s, 期望新结果 inf-1-0 覆盖前缀", res.Rows[0].UserID)
	}
}

// TestPrewarmEntitiesUsesBoardDefaultField 预热必须按各榜 UI 默认口径(达人=带货榜 2),
// 而不是沿用调用方传入的商品 combo RankField(1=粉丝榜)——否则顺序表键与读路径对不上。
func TestPrewarmEntitiesUsesBoardDefaultField(t *testing.T) {
	db := openEntityTestDB(t)
	fake := &influencerFake{perPage: map[string]int{"1": 10, "2": 10}}
	srv := httptest.NewServer(http.HandlerFunc(fake.serve))
	defer srv.Close()

	svc := NewDiscoverService(db, echotik.New(config.EchoTikConfig{BaseURL: srv.URL, Username: "u", Password: "p"}), nil, nil, 0)
	ctx := context.Background()
	// 调用方传 RankField=1(商品 combo 口径),应被各榜默认口径覆盖。
	p := echotik.RanklistParams{Region: "US", RankType: echotik.RankHot, RankField: echotik.FieldSales, PageSize: 20}
	if err := svc.PrewarmEntities(ctx, p, 1, boardInfluencer); err != nil {
		t.Fatalf("预热失败: %v", err)
	}
	for _, f := range fake.fields() {
		if f != "2" {
			t.Fatalf("上游收到 influencer_rank_field=%s, 期望 2(带货榜)", f)
		}
	}
	// 读路径(handler 默认 field=2)必须命中,而不是 miss 后返回空+warming。
	res := svc.InfluencerRanklist(ctx, echotik.RanklistParams{
		Region: "US", RankType: echotik.RankHot, RankField: echotik.InfluencerFieldSales, PageSize: 20,
	})
	if len(res.Rows) != 20 {
		t.Errorf("读路径行数=%d, 期望 20(预热键与读键对齐)", len(res.Rows))
	}
}

// withField 补上达人榜默认口径,用于直接查顺序表。
func withField(p echotik.RanklistParams) echotik.RanklistParams {
	p.RankField = echotik.InfluencerFieldSales
	return p
}
