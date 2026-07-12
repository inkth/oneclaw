package service

import (
	"reflect"
	"testing"
)

func TestPageSlice(t *testing.T) {
	ids := []string{"a", "b", "c", "d", "e"}
	cases := []struct {
		name              string
		ids               []string
		pageNum, pageSize int
		want              []string
	}{
		{"first page", ids, 1, 2, []string{"a", "b"}},
		{"second page", ids, 2, 2, []string{"c", "d"}},
		{"third page partial", ids, 3, 2, []string{"e"}},
		{"page beyond depth -> empty", ids, 4, 2, nil},
		{"page 0 treated as 1", ids, 0, 2, []string{"a", "b"}},
		{"pageSize 0 -> all", ids, 1, 0, ids},
		{"exact full page", ids, 1, 5, ids},
		{"empty ids", nil, 1, 2, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := pageSlice(c.ids, c.pageNum, c.pageSize); !reflect.DeepEqual(got, c.want) {
				t.Errorf("pageSlice(%v, %d, %d) = %v, want %v", c.ids, c.pageNum, c.pageSize, got, c.want)
			}
		})
	}
}
