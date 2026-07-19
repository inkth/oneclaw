package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/faxianmao/server/internal/model"
)

func TestAdvisorPromptKeepsFinancialAndProductBoundaries(t *testing.T) {
	want := []string{
		"没有当前可靠资料时不要把记忆中的数字说成现行规则",
		"贡献毛利率要先扣除广告以外的可变成本",
		"目前不接收完整成本明细,不能代替利润核算或自动计算保本 ROI",
		"不能在回答中声称已经替用户创建任务",
		"根据问题复杂度决定篇幅",
		"不要为了凑短而省略关键前提",
	}
	for _, phrase := range want {
		if !strings.Contains(advisorSystem, phrase) {
			t.Errorf("advisorSystem missing guardrail %q", phrase)
		}
	}
}

func TestOptsFromTaskRestoresAdvisorReferences(t *testing.T) {
	productID := uuid.New()
	referenceTaskID := uuid.New()
	meta, err := json.Marshal(map[string]string{
		"productId":         productID.String(),
		"discoverProductId": "echo-product-1",
		"discoverRegion":    "US",
		"referenceTaskId":   referenceTaskID.String(),
	})
	if err != nil {
		t.Fatal(err)
	}

	opts := optsFromTask(&model.AgentTask{Metadata: model.JSONB(meta)})
	if opts.ProductID == nil || *opts.ProductID != productID {
		t.Fatalf("product reference not restored: %#v", opts.ProductID)
	}
	if opts.ReferenceTaskID == nil || *opts.ReferenceTaskID != referenceTaskID {
		t.Fatalf("analysis reference not restored: %#v", opts.ReferenceTaskID)
	}
	if opts.DiscoverProductID != "echo-product-1" || opts.DiscoverRegion != "US" {
		t.Fatalf("discover reference not restored: %#v", opts)
	}
}
