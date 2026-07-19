package llm

import "testing"

func TestEstimateCostCentsQwen37Plus(t *testing.T) {
	// $0.32 input + $1.28 output for one million tokens each = $1.60.
	if got := estimateCostCents("qwen/qwen3.7-plus", 1_000_000, 1_000_000); got != 160 {
		t.Fatalf("estimateCostCents() = %d, want 160", got)
	}
}
