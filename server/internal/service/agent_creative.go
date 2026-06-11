package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

// ── Director:写脚本 → 下发视频 ───────────────────────────────────────────────

const directorSystem = `你是 OneClaw 的"创意总监 Agent",服务 TikTok Shop 跨境卖家。
根据用户的商品/需求,产出一条可直接生成的短视频创意。

只输出合法 JSON,不要 markdown:
{
  "title": "视频标题(中文,≤20字)",
  "script": "分镜脚本:3-5 个镜头,每镜头一行,含画面+口播要点",
  "videoPrompt": "用于文生视频模型的英文视觉提示词(一句话,具体、可拍,描述画面/光线/运镜)",
  "durationSec": 5,
  "aspectRatio": "9:16"
}`

type directorOut struct {
	Title       string `json:"title"`
	Script      string `json:"script"`
	VideoPrompt string `json:"videoPrompt"`
	DurationSec int    `json:"durationSec"`
	AspectRatio string `json:"aspectRatio"`
}

func (s *AgentService) runDirector(ctx context.Context, wsID uuid.UUID, input string) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请设置 OPENROUTER_API_KEY")
	}
	res, err := s.llm.Chat(ctx, directorSystem, input, true, 1500)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}
	var out directorOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("解析脚本失败: %w", err)
	}
	if strings.TrimSpace(out.VideoPrompt) == "" {
		out.VideoPrompt = input
	}
	if out.DurationSec <= 0 {
		out.DurationSec = 5
	}
	if out.AspectRatio == "" {
		out.AspectRatio = "9:16"
	}
	title := out.Title
	if title == "" {
		title = firstN(input, 40)
	}

	meta := map[string]any{"title": title, "script": out.Script}
	var b strings.Builder
	fmt.Fprintf(&b, "🎬 %s\n\n%s\n", title, out.Script)

	// 下发视频(异步,VideoService 自己轮询 + 转存)
	if s.videos != nil {
		v, e := s.videos.Create(ctx, wsID, VideoInput{
			Title: title, Prompt: out.VideoPrompt, Style: model.VideoStyleScene,
			DurationSec: out.DurationSec, AspectRatio: out.AspectRatio,
		})
		if e != nil {
			b.WriteString("\n⚠️ 视频下发失败:" + e.Error())
		} else {
			meta["videoId"] = v.ID.String()
			sc := out.Script
			s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", v.ID).Update("script", sc)
			// 异步生成封面(best-effort,独立 context)
			vid, prompt, ar := v.ID, out.VideoPrompt, out.AspectRatio
			go func() {
				cctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
				defer cancel()
				s.videos.GenerateCover(cctx, vid, prompt, ar)
			}()
			b.WriteString("\n✅ 已提交视频生成(见短视频墙),约 1-2 分钟出片。")
		}
	}
	return b.String(), meta, res.Usage, nil
}
