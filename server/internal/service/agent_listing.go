package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/service/llm"
)

// ── Listing:标题 / 五点卖点 / A+ 结构 / 主图出图 prompt ─────────────────────

const listingSystem = `你是 OneClaw 的"Listing 内容 Agent",服务 TikTok Shop 跨境卖家。
根据用户的商品描述,产出一套可直接上架的 Listing 内容。

只输出合法 JSON,不要 markdown:
{
  "title": "英文商品标题(≤150字符,含核心关键词,前 60 字符放最重要卖点)",
  "sellingPoints": ["5 条英文五点卖点,每条 ≤200 字符,开头大写核心词"],
  "aplusSections": [
    { "heading": "A+ 模块标题(中文)", "body": "模块文案(中文,≤80字)", "imagePrompt": "该模块配图的英文出图 prompt" }
  ],
  "imagePrompts": ["3-5 条主图英文出图 prompt,白底图/场景图/细节图/对比图,具体可拍"],
  "hashtags": ["8-12 个 TikTok 标签,带 # 前缀"]
}
aplusSections 给 3-4 个模块,覆盖:核心卖点、使用场景、规格细节、信任背书。`

type listingOut struct {
	Title         string   `json:"title"`
	SellingPoints []string `json:"sellingPoints"`
	AplusSections []struct {
		Heading     string `json:"heading"`
		Body        string `json:"body"`
		ImagePrompt string `json:"imagePrompt"`
	} `json:"aplusSections"`
	ImagePrompts []string `json:"imagePrompts"`
	Hashtags     []string `json:"hashtags"`
}

func (s *AgentService) runListing(ctx context.Context, _ uuid.UUID, input string) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请设置 OPENROUTER_API_KEY")
	}
	res, err := s.llm.Chat(ctx, listingSystem, input, true, 2200)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}
	var out listingOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("解析 Listing 输出失败: %w", err)
	}
	if out.Title == "" || len(out.SellingPoints) == 0 {
		return "", nil, llm.Usage{}, fmt.Errorf("模型未给出有效的 Listing 内容")
	}

	var b strings.Builder
	fmt.Fprintf(&b, "🖼️ Listing 标题\n%s\n\n", out.Title)
	b.WriteString("✨ 五点卖点\n")
	for i, p := range out.SellingPoints {
		fmt.Fprintf(&b, "%d. %s\n", i+1, p)
	}
	if len(out.AplusSections) > 0 {
		b.WriteString("\n📑 A+ 图文结构\n")
		for _, sec := range out.AplusSections {
			fmt.Fprintf(&b, "■ %s\n%s\n  ↳ 配图 prompt:%s\n", sec.Heading, sec.Body, sec.ImagePrompt)
		}
	}
	if len(out.ImagePrompts) > 0 {
		b.WriteString("\n🎨 主图出图 prompt\n")
		for i, p := range out.ImagePrompts {
			fmt.Fprintf(&b, "%d. %s\n", i+1, p)
		}
	}
	if len(out.Hashtags) > 0 {
		b.WriteString("\n🏷️ " + strings.Join(out.Hashtags, " "))
	}

	meta := map[string]any{
		"title":         out.Title,
		"sellingPoints": out.SellingPoints,
		"aplusSections": out.AplusSections,
		"imagePrompts":  out.ImagePrompts,
		"hashtags":      out.Hashtags,
	}
	return b.String(), meta, res.Usage, nil
}
