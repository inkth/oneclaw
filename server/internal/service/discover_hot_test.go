package service

import "testing"

func TestCleanHotDesc(t *testing.T) {
	cases := []struct{ in, want string }{
		{"#fyp #tiktokmademebuyit", ""},
		{"This jacket is so warm #fyp @brand", "This jacket is so warm"},
		{"  spaced   out   words  ", "spaced out words"},
		{"@only @mentions", ""},
		{"keep #tag inline words", "keep inline words"},
	}
	for _, c := range cases {
		if got := cleanHotDesc(c.in); got != c.want {
			t.Errorf("cleanHotDesc(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestSelectTopHotVideos(t *testing.T) {
	// 降序 + 过滤 SaleCnt<=0 + 丢纯标签 + 文案去重
	in := []HotVideoRef{
		{Desc: "best winter jacket ever", SaleCnt: 50},
		{Desc: "this serum cleared my skin", SaleCnt: 300},
		{Desc: "zero sales should drop", SaleCnt: 0},      // 丢:SaleCnt<=0
		{Desc: "#fyp #ad", SaleCnt: 999},                  // 丢:清洗后过短
		{Desc: "this serum cleared my skin", SaleCnt: 80}, // 丢:与第 2 条文案重复
		{Desc: "grippy phone case for cars", SaleCnt: 120},
	}
	got := selectTopHotVideos(in, 5)
	want := []struct {
		desc string
		sale int
	}{
		{"this serum cleared my skin", 300},
		{"grippy phone case for cars", 120},
		{"best winter jacket ever", 50},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d refs, want %d: %+v", len(got), len(want), got)
	}
	for i, w := range want {
		if got[i].Desc != w.desc || got[i].SaleCnt != w.sale {
			t.Errorf("rank %d = (%q,%d), want (%q,%d)", i, got[i].Desc, got[i].SaleCnt, w.desc, w.sale)
		}
	}

	// 截断到 limit
	many := []HotVideoRef{
		{Desc: "alpha widget gadget", SaleCnt: 10},
		{Desc: "bravo widget gadget", SaleCnt: 9},
		{Desc: "charlie widget gadget", SaleCnt: 8},
	}
	if got := selectTopHotVideos(many, 2); len(got) != 2 {
		t.Errorf("limit=2 → got %d, want 2", len(got))
	}

	// 空输入 → 空
	if got := selectTopHotVideos(nil, 5); len(got) != 0 {
		t.Errorf("nil input → got %d, want 0", len(got))
	}
}
