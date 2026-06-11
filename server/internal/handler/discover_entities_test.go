package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/oneclaw/server/internal/config"
	"github.com/oneclaw/server/internal/service"
	"github.com/oneclaw/server/internal/service/echotik"
)

// 三榜端点无 DB 依赖:未配置 EchoTik 凭证时降级到 mock。用 nil db 构造服务即可端到端验证
// 「query 解析 → service → mock → DTO 映射 → {ok,data} 信封」。
func newEntityRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	disc := service.NewDiscoverService(nil, echotik.New(config.EchoTikConfig{}))
	h := NewDiscoverHandler(disc, nil, nil)
	r := gin.New()
	r.GET("/discover/seller-ranklist", h.SellerRanklist)
	r.GET("/discover/influencer-ranklist", h.InfluencerRanklist)
	r.GET("/discover/video-ranklist", h.VideoRanklist)
	return r
}

func decodeRows(t *testing.T, body []byte) (string, []map[string]any) {
	t.Helper()
	var env struct {
		OK   bool `json:"ok"`
		Data struct {
			State string           `json:"state"`
			Rows  []map[string]any `json:"rows"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("bad json: %v\n%s", err, body)
	}
	if !env.OK {
		t.Fatalf("ok=false: %s", body)
	}
	return env.Data.State, env.Data.Rows
}

func TestEntityRanklists_MockFallback(t *testing.T) {
	r := newEntityRouter()
	cases := []struct {
		path   string
		idKey  string
		nameOf string
	}{
		{"/discover/seller-ranklist?region=GB&rank_type=2&field=2", "sellerId", "sellerName"},
		{"/discover/influencer-ranklist?region=US&field=1", "userId", "nickName"},
		{"/discover/video-ranklist?region=TH&rank_type=3", "videoId", "desc"},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, c.path, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status %d", c.path, w.Code)
		}
		state, rows := decodeRows(t, w.Body.Bytes())
		if state != "mock" {
			t.Errorf("%s: state=%q want mock", c.path, state)
		}
		if len(rows) != 8 {
			t.Errorf("%s: got %d rows want 8", c.path, len(rows))
		}
		if len(rows) > 0 {
			if rows[0][c.idKey] == nil || rows[0][c.idKey] == "" {
				t.Errorf("%s: row0 missing %s", c.path, c.idKey)
			}
			if rows[0][c.nameOf] == nil || rows[0][c.nameOf] == "" {
				t.Errorf("%s: row0 missing %s", c.path, c.nameOf)
			}
		}
	}
}

func TestSellerRegionEcho(t *testing.T) {
	r := newEntityRouter()
	req := httptest.NewRequest(http.MethodGet, "/discover/seller-ranklist?region=VN", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	_, rows := decodeRows(t, w.Body.Bytes())
	if len(rows) == 0 || rows[0]["region"] != "VN" {
		t.Fatalf("region not echoed into mock rows: %v", rows[0]["region"])
	}
	// 店铺类目应被解析成数组。
	if _, ok := rows[0]["categories"].([]any); !ok {
		t.Errorf("categories not an array: %T", rows[0]["categories"])
	}
}
