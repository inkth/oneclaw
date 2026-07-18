package llm

import (
	"encoding/json"
	"testing"
)

func TestExtractJSON(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"clean", `{"a":1}`, `{"a":1}`},
		{"fenced", "```json\n{\"a\":1}\n```", `{"a":1}`},
		{"trailing brace", "{\"a\":1}\n}", `{"a":1}`},     // 生产遇到的多余 }
		{"trailing prose", `{"a":1} 说明:以上是结果`, `{"a":1}`}, // JSON 后追加散文
		{"leading prose", "结果如下:\n{\"a\":1}", `{"a":1}`},
		{"array trailing junk", `[1,2,3]]`, `[1,2,3]`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ExtractJSON(c.in)
			if !json.Valid([]byte(got)) {
				t.Fatalf("ExtractJSON(%q) = %q,非合法 JSON", c.in, got)
			}
			if got != c.want {
				t.Fatalf("ExtractJSON(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
