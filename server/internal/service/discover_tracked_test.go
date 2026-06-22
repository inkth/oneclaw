package service

import "testing"

func TestDetailTTLFor(t *testing.T) {
	if detailTTLFor(true) != trackedDetailTTL {
		t.Errorf("tracked 应用 trackedDetailTTL,得到 %v", detailTTLFor(true))
	}
	if detailTTLFor(false) != untrackedDetailTTL {
		t.Errorf("untracked 应用 untrackedDetailTTL,得到 %v", detailTTLFor(false))
	}
	// 热度加权的核心不变量:被跟踪的实体必须比普通实体刷得更勤(TTL 更短)。
	if trackedDetailTTL >= untrackedDetailTTL {
		t.Errorf("trackedDetailTTL(%v) 应短于 untrackedDetailTTL(%v)", trackedDetailTTL, untrackedDetailTTL)
	}
}
