package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/service"
	"github.com/faxianmao/server/internal/service/echotik"
)

// 三榜端点无 DB 依赖:未配置 EchoTik 凭证时返回空态。用 nil db 构造服务即可端到端验证
// 「query 解析 → service → 空态 → {ok,data} 信封」。
func newEntityRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	disc := service.NewDiscoverService(nil, echotik.New(config.EchoTikConfig{}), nil, nil, 0)
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

// 未配置 EchoTik 时三榜应返回空态(state=empty, rows=[]),而不是报错或 nil rows。
func TestEntityRanklists_EmptyWithoutEchoTik(t *testing.T) {
	r := newEntityRouter()
	paths := []string{
		"/discover/seller-ranklist?region=GB&rank_type=2&field=2",
		"/discover/influencer-ranklist?region=US&field=1",
		"/discover/video-ranklist?region=TH&rank_type=3",
	}
	for _, path := range paths {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status %d", path, w.Code)
		}
		state, rows := decodeRows(t, w.Body.Bytes())
		if state != "empty" {
			t.Errorf("%s: state=%q want empty", path, state)
		}
		if rows == nil || len(rows) != 0 {
			t.Errorf("%s: rows=%v want empty array", path, rows)
		}
	}
}
