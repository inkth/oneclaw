package service

import (
	"reflect"
	"testing"

	"github.com/faxianmao/server/internal/service/echotik"
)

func TestMergeIDsAt(t *testing.T) {
	existing := []string{"a", "b", "c", "d", "e", "f"}
	cases := []struct {
		name     string
		existing []string
		ids      []string
		start    int
		want     []string
	}{
		// 核心防缩水:上游只回来 2 条时,不能把已存的 6 条截断成 2 条。
		{"short list keeps tail", existing, []string{"a", "x"}, 0,
			[]string{"a", "x", "c", "d", "e", "f"}},
		{"full refresh replaces all", existing, []string{"z", "y", "x", "w", "v", "u"}, 0,
			[]string{"z", "y", "x", "w", "v", "u"}},
		{"deeper list grows", existing, []string{"a", "b", "c", "d", "e", "f", "g"}, 0,
			[]string{"a", "b", "c", "d", "e", "f", "g"}},
		{"second page overwrites its range", existing, []string{"x", "y"}, 2,
			[]string{"a", "b", "x", "y", "e", "f"}},
		{"gap beyond existing appends", []string{"a", "b"}, []string{"x"}, 5,
			[]string{"a", "b", "x"}},
		{"dedup keeps first position", existing, []string{"f", "x"}, 0,
			[]string{"f", "x", "c", "d", "e"}},
		{"no existing", nil, []string{"a", "b"}, 0, []string{"a", "b"}},
		{"negative start treated as 0", existing, []string{"x"}, -3,
			[]string{"x", "b", "c", "d", "e", "f"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// 输入不可被就地改写(existing 是调用方复用的切片)。
			src := append([]string(nil), c.existing...)
			got := mergeIDsAt(src, c.ids, c.start)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("mergeIDsAt(%v, %v, %d) = %v, want %v", c.existing, c.ids, c.start, got, c.want)
			}
		})
	}
}

// 各榜写入口径必须与 handler 默认读一致,否则顺序表 rank_field 键对不上、预热/回填白做。
func TestEntityDefaultRankField(t *testing.T) {
	cases := map[string]int{
		boardSeller:     echotik.SellerFieldSales,
		boardInfluencer: echotik.InfluencerFieldSales,
		boardVideo:      echotik.VideoFieldSales,
		boardProduct:    echotik.FieldSales,
	}
	for kind, want := range cases {
		if got := entityDefaultRankField(kind); got != want {
			t.Errorf("entityDefaultRankField(%q) = %d, want %d", kind, got, want)
		}
	}
}
