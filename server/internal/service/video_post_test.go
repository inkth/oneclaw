package service

import (
	"strings"
	"testing"
)

func TestParseVOCues(t *testing.T) {
	// 1. 镜头时间轴与台词一一对应 → 直接用 (a-bs)
	prompt := `Shot 1 (0-3s): product reveal. VO: "Stop scrolling, you need this."
Shot 2 (3-8s): demo. VO: "It cleans in seconds."
Shot 3 (8-12s): price. VO: "Only nine ninety nine today."
All spoken dialogue is in English.`
	cues := parseVOCues(prompt, 12)
	if len(cues) != 3 {
		t.Fatalf("got %d cues, want 3: %+v", len(cues), cues)
	}
	if cues[0].Text != "Stop scrolling, you need this." {
		t.Errorf("cue0 text = %q", cues[0].Text)
	}
	if cues[0].StartSec != 0 || cues[0].EndSec != 3 {
		t.Errorf("cue0 timing = %v-%v, want 0-3", cues[0].StartSec, cues[0].EndSec)
	}
	if cues[2].StartSec != 8 || cues[2].EndSec != 12 {
		t.Errorf("cue2 timing = %v-%v, want 8-12", cues[2].StartSec, cues[2].EndSec)
	}

	// 2. 无时间戳 → 按台词数均分总时长
	c2 := parseVOCues(`VO: "line one" then VO: "line two"`, 10)
	if len(c2) != 2 || c2[0].StartSec != 0 || c2[0].EndSec != 5 || c2[1].StartSec != 5 || c2[1].EndSec != 10 {
		t.Errorf("even split wrong: %+v", c2)
	}

	// 3. 无 VO / 空 prompt → nil
	if parseVOCues("no spoken lines here", 10) != nil {
		t.Error("expected nil for no VO")
	}
	if parseVOCues("", 10) != nil {
		t.Error("expected nil for empty prompt")
	}

	// 4. 时间越界 → clamp 到 duration
	c4 := parseVOCues(`Shot 1 (0-20s): x. VO: "way too long"`, 8)
	if len(c4) != 1 || c4[0].EndSec != 8 {
		t.Errorf("clamp failed: %+v", c4)
	}

	// 5. durationSec<=0 → 台词数*3 兜底,不 panic
	c5 := parseVOCues(`VO: "a" VO: "b"`, 0)
	if len(c5) != 2 || c5[1].EndSec != 6 {
		t.Errorf("zero-duration fallback wrong: %+v", c5)
	}

	// 6. 全角 “ ” / 日式「」 引号也能抽到台词(CJK 市场 LLM 常用,不止 ASCII 引号)
	c6 := parseVOCues(`Shot 1 (0-3s): x. VO: 「これ、まじで神。」 Shot 2 (3-6s): y. VO: “毎日使ってる”`, 6)
	if len(c6) != 2 {
		t.Fatalf("full-width quotes: got %d cues, want 2: %+v", len(c6), c6)
	}
	if c6[0].Text != "これ、まじで神。" {
		t.Errorf("c6[0] text = %q, want corner-bracket content", c6[0].Text)
	}
	if c6[1].Text != "毎日使ってる" {
		t.Errorf("c6[1] text = %q, want full-width-quote content", c6[1].Text)
	}

	// 7. 无时间轴且台词长短不一 → 按字符长度加权:长句占更久;整体连续铺满总时长
	c7 := parseVOCues(`VO: "hi" then VO: "this is a much longer spoken line"`, 12)
	if len(c7) != 2 {
		t.Fatalf("weighted split: got %d cues, want 2", len(c7))
	}
	if !(c7[1].EndSec-c7[1].StartSec > c7[0].EndSec-c7[0].StartSec) {
		t.Errorf("longer line should get longer span: %+v", c7)
	}
	if c7[0].StartSec != 0 || c7[0].EndSec != c7[1].StartSec || c7[1].EndSec < 11.9 {
		t.Errorf("weighted spans should be contiguous over total: %+v", c7)
	}
}

func TestBuildASSAndTime(t *testing.T) {
	if got := assTime(8.5); got != "0:00:08.50" {
		t.Errorf("assTime(8.5) = %q", got)
	}
	ass := buildASS([]voCue{{StartSec: 0, EndSec: 3, Text: "Hello {world}"}}, "9:16")
	if !strings.Contains(ass, "PlayResY: 1920") {
		t.Error("ASS missing 9:16 PlayResY")
	}
	if !strings.Contains(ass, "Hello (world)") { // 花括号被转义
		t.Errorf("ASS did not escape braces: %s", ass)
	}
	if !strings.Contains(ass, "Dialogue: 0,0:00:00.00,0:00:03.00,Default") {
		t.Errorf("ASS dialogue line wrong: %s", ass)
	}
}
