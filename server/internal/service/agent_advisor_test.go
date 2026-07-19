package service

import (
	"strings"
	"testing"
)

func TestAdvisorPromptKeepsFinancialAndProductBoundaries(t *testing.T) {
	want := []string{
		"没有当前可靠资料时不要把记忆中的数字说成现行规则",
		"贡献毛利率要先扣除广告以外的可变成本",
		"目前不接收完整成本明细,不能代替利润核算或自动计算保本 ROI",
		"不能在回答中声称已经替用户创建任务",
		"单次回答硬性限制在 400 个中文字符以内",
	}
	for _, phrase := range want {
		if !strings.Contains(advisorSystem, phrase) {
			t.Errorf("advisorSystem missing guardrail %q", phrase)
		}
	}
}

func TestTrimAdvisorReplyEndsAtCompleteSentence(t *testing.T) {
	long := strings.Repeat("这是需要保留的建议。", 60)
	got := trimAdvisorReply(long)
	if len([]rune(got)) > advisorReplyMaxRunes {
		t.Fatalf("trimmed reply has %d runes, max %d", len([]rune(got)), advisorReplyMaxRunes)
	}
	if !strings.HasSuffix(got, "。") {
		t.Fatalf("trimmed reply should end at sentence boundary: %q", got[len(got)-12:])
	}
}
