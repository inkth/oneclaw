package service

import "testing"

func TestStripMockIDs(t *testing.T) {
	cases := []struct {
		name    string
		in      []string
		want    []string
		changed bool
	}{
		{"none", []string{"a", "b"}, []string{"a", "b"}, false},
		{"all mock", []string{"mock-juicer-380", "mock-led-strip"}, []string{}, true},
		{"mixed", []string{"real-1", "mock-vid-1", "real-2"}, []string{"real-1", "real-2"}, true},
		{"empty", nil, []string{}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, changed := stripMockIDs(c.in)
			if changed != c.changed {
				t.Fatalf("changed = %v, want %v", changed, c.changed)
			}
			if len(got) != len(c.want) {
				t.Fatalf("got %v, want %v", got, c.want)
			}
			for i := range got {
				if got[i] != c.want[i] {
					t.Fatalf("got %v, want %v", got, c.want)
				}
			}
		})
	}
}
