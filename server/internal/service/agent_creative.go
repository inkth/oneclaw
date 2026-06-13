package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

// ── Director:写脚本 → 下发视频 ───────────────────────────────────────────────

const directorSystem = `你是 OneClaw 的"短视频创作 Agent",服务 TikTok Shop 跨境卖家(主要面向美国市场)。
根据用户的商品/需求,产出一条可直接生成的带货短视频:分镜、英文口播、视频提示词三者必须一一对应。

先判断哪种叙事角度最适合该商品,从下面四种里选一个:
- UNBOXING(开箱):有质感、配件多、第一印象强的实物
- COMPARISON(对比):有竞品参照或参数可比的商品
- SCENE(场景):融入生活方式、使用场景出片的商品
- BEFORE_AFTER(效果对比):使用前后有可见变化的商品
不要硬套不合适的角度;分镜必须体现所选角度的叙事结构。

如果用户消息附带「商品档案」,以档案里的真实卖点、价格、市场数据为准:
口播要引用其中的具体信息(如价格、卖点),绝对不要编造数字。

规则:
- 视频总时长 4-15 秒,按镜头数合理分配(3 镜头约 9-12 秒),时间轴必须连续且与总时长一致
- 口播是英文(美国观众听的),口语化 UGC 语气,短句,每镜头一句
- videoPrompt 是英文多镜头提示词,逐镜头描述画面/运镜/光线,并把口播台词用引号写进对应镜头
  (视频模型支持音画联合生成,会按引号内台词输出英文配音),镜头间用自然剪切衔接

只输出合法 JSON,不要 markdown:
{
  "style": "UNBOXING | COMPARISON | SCENE | BEFORE_AFTER 之一",
  "title": "视频标题(中文,≤20字)",
  "script": "分镜脚本,3-5 个镜头,每镜头一行,格式:镜头N(起-止秒)|画面(中文)|口播原文(英文)",
  "videoPrompt": "Shot 1 (0-3s): visual description, camera move, lighting. VO: \"spoken line.\" Shot 2 (3-7s): ...",
  "durationSec": 12,
  "aspectRatio": "9:16"
}`

type directorOut struct {
	Style       string `json:"style"`
	Title       string `json:"title"`
	Script      string `json:"script"`
	VideoPrompt string `json:"videoPrompt"`
	DurationSec int    `json:"durationSec"`
	AspectRatio string `json:"aspectRatio"`
}

var styleLabels = map[string]string{
	model.VideoStyleUnboxing:    "开箱",
	model.VideoStyleComparison:  "对比",
	model.VideoStyleScene:       "场景",
	model.VideoStyleBeforeAfter: "效果对比",
}

// normalizeStyle 把 LLM 输出归一到四个合法风格,非法或为空时回落 SCENE。
func normalizeStyle(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	if _, ok := styleLabels[s]; ok {
		return s
	}
	return model.VideoStyleScene
}

// productFacts 把选品库商品(及关联 EchoTik 市场数据)压成事实块,供 DIRECTOR/LISTING 注入创作上下文;
// 同时返回商品实拍主图 URL(视频首帧 / Listing 出图参考,真货入画)。商品不存在或不属于该工作台时 ok=false。
func (s *AgentService) productFacts(ctx context.Context, wsID, productID uuid.UUID) (facts, coverURL string, ok bool) {
	var p model.Product
	if err := s.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ?", productID, wsID).
		First(&p).Error; err != nil {
		return "", "", false
	}
	var b strings.Builder
	fmt.Fprintf(&b, "商品:%s", p.Title)
	if p.Category != "" {
		fmt.Fprintf(&b, "(%s)", p.Category)
	}
	fmt.Fprintf(&b, "\n售价 $%.2f · 毛利 %d%% · ROI 评分 %d", float64(p.PriceCents)/100, p.MarginPct, p.RoiScore)
	if p.MonthlySales > 0 {
		fmt.Fprintf(&b, " · 月销 %d", p.MonthlySales)
	}
	if p.TrendDelta != 0 {
		fmt.Fprintf(&b, " · 销量趋势 %+d%%", p.TrendDelta)
	}
	b.WriteString("\n")
	if p.Note != nil && strings.TrimSpace(*p.Note) != "" {
		fmt.Fprintf(&b, "选品理由:%s\n", *p.Note)
	}
	if p.DiscoverProductID != nil {
		var dp model.DiscoverProduct
		if err := s.db.WithContext(ctx).First(&dp, "id = ?", *p.DiscoverProductID).Error; err == nil {
			fmt.Fprintf(&b, "市场数据(EchoTik %s):佣金 %.1f%% · 总销量 %d · 带货视频 %d 条 · 带货达人 %d 人\n",
				dp.Region, dp.CommissionRate, dp.TotalSaleCnt, dp.TotalVideoCnt, dp.TotalIflCnt)
			if len(dp.CoverUrls) > 0 {
				var urls []string
				if json.Unmarshal(dp.CoverUrls, &urls) == nil && len(urls) > 0 {
					coverURL = strings.TrimSpace(urls[0])
				}
			}
		}
	}
	return b.String(), coverURL, true
}

func (s *AgentService) runDirector(ctx context.Context, wsID uuid.UUID, input string, opts AgentCreateOpts) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请设置 OPENROUTER_API_KEY")
	}
	productID := opts.ProductID
	user := input

	// 首帧优先级:用户指定素材 > 商品实拍主图(都没有则 ConfirmVideo 时人设场景照兜底)。
	firstFrameURL := ""
	if opts.MaterialID != nil {
		firstFrameURL = s.materialImageURL(ctx, wsID, *opts.MaterialID)
	}
	if productID != nil {
		if facts, cover, ok := s.productFacts(ctx, wsID, *productID); ok {
			user = fmt.Sprintf("%s\n\n商品档案(选品库真实数据):\n%s", input, facts)
			if firstFrameURL == "" {
				firstFrameURL = cover
			}
		} else {
			// 商品查不到就当没传,避免把视频挂到无效商品上
			productID = nil
		}
	}
	if firstFrameURL != "" {
		user += "\n注:已指定一张实拍图作为视频首帧,videoPrompt 请以该画面为起点设计运镜,自然展开。"
	}

	// 出镜人设:脚本与口播按这位创作者出镜来写;外观提示词由 ConfirmVideo 统一注入,避免重复描述。
	var persona *model.ModelAsset
	if opts.PersonaID != nil {
		if _, _, asset := s.personaPrompt(ctx, wsID, *opts.PersonaID); asset != nil {
			persona = asset
			tone := ""
			if asset.Style != nil && strings.TrimSpace(*asset.Style) != "" {
				tone = "(" + strings.TrimSpace(*asset.Style) + ")"
			}
			user += fmt.Sprintf(
				"\n出镜人设:%s%s。分镜与英文口播请按这位真人创作者第一人称出镜设计,口吻贴合人设;不要在 videoPrompt 里描述其外貌,系统出片时会自动注入。",
				asset.Name, tone)
		}
	}

	res, err := s.llm.Chat(ctx, directorSystem, user, true, 2200)
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
	// 时长夹在 Seedance 2.0 支持的 4-15s;缺省给 12s(够放 3 个镜头)。
	switch {
	case out.DurationSec <= 0:
		out.DurationSec = 12
	case out.DurationSec < 4:
		out.DurationSec = 4
	case out.DurationSec > 15:
		out.DurationSec = 15
	}
	if out.AspectRatio == "" {
		out.AspectRatio = "9:16"
	}
	title := out.Title
	if title == "" {
		title = firstN(input, 40)
	}
	style := normalizeStyle(out.Style)

	// 只产脚本草稿,不直接下发视频:用户在任务流里确认后才消耗视频生成额度(ConfirmVideo)。
	meta := map[string]any{
		"title": title, "script": out.Script, "style": style,
		"videoPrompt": out.VideoPrompt, "durationSec": out.DurationSec, "aspectRatio": out.AspectRatio,
		"draft": true,
	}
	if productID != nil {
		meta["productId"] = productID.String()
	}
	if firstFrameURL != "" {
		meta["firstFrameUrl"] = firstFrameURL
	}
	if persona != nil {
		meta["preferredPersonaId"] = persona.ID.String()
		meta["personaName"] = persona.Name
	}
	var b strings.Builder
	fmt.Fprintf(&b, "🎬 %s · 角度:%s\n\n%s\n", title, styleLabels[style], out.Script)
	if firstFrameURL != "" {
		b.WriteString("\n🖼 已取实拍图作为视频首帧,出镜的就是你的真货。")
	}
	if persona != nil {
		fmt.Fprintf(&b, "\n🎤 出镜人设「%s」已就位,确认出片时自动沿用。", persona.Name)
	}
	b.WriteString("\n📝 脚本已就绪。满意就点下方「生成视频」出片;想换方向,直接重新派活描述新要求。")
	return b.String(), meta, res.Usage, nil
}

// materialImageURL 校验素材属于该工作台且为图片,返回其 URL;不合法返回空串(当没传处理)。
func (s *AgentService) materialImageURL(ctx context.Context, wsID, materialID uuid.UUID) string {
	var m model.Material
	if err := s.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ? AND type = ?", materialID, wsID, "IMAGE").
		First(&m).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(m.URL)
}

// directorDraft 是 DIRECTOR 任务 metadata 里的脚本草稿(runDirector 写入,ConfirmVideo 消费)。
type directorDraft struct {
	Title              string `json:"title"`
	Script             string `json:"script"`
	Style              string `json:"style"`
	VideoPrompt        string `json:"videoPrompt"`
	DurationSec        int    `json:"durationSec"`
	AspectRatio        string `json:"aspectRatio"`
	ProductID          string `json:"productId"`
	FirstFrameURL      string `json:"firstFrameUrl"`
	PreferredPersonaID string `json:"preferredPersonaId"` // 派活时预选的人设,ConfirmVideo 未指定时沿用
	VideoID            string `json:"videoId"`
	Draft              bool   `json:"draft"`
}

// personaPrompt 把人设资产压成视频 prompt 注入段 + 兜底首帧图。
// 预置人设 Description 末行带「外观提示词:<英文 look>」,自有模特退化用 description/style。
func (s *AgentService) personaPrompt(ctx context.Context, wsID, personaID uuid.UUID) (line, refImage string, asset *model.ModelAsset) {
	var m model.ModelAsset
	if err := s.db.WithContext(ctx).
		Where("id = ? AND (workspace_id = ? OR is_preset = TRUE)", personaID, wsID).
		First(&m).Error; err != nil {
		return "", "", nil
	}
	look := ""
	if m.Description != nil {
		desc := *m.Description
		if i := strings.Index(desc, "外观提示词:"); i >= 0 {
			look = strings.TrimSpace(desc[i+len("外观提示词:"):])
		} else {
			look = strings.TrimSpace(desc)
		}
	}
	if look == "" && m.Style != nil {
		look = strings.TrimSpace(*m.Style)
	}
	if look == "" {
		return "", "", nil
	}
	line = fmt.Sprintf(
		"\nOn-camera creator: %s. The exact same person is the presenter in every shot — consistent face, hairstyle and outfit, natural UGC selfie energy.",
		look)
	// 场景照(参考图组第 4 张)最像实拍开场,作无商品图时的首帧兜底;没有就用头像。
	var refs []string
	if len(m.RefImageURLs) > 0 && json.Unmarshal(m.RefImageURLs, &refs) == nil && len(refs) > 0 {
		refImage = refs[len(refs)-1]
	} else if m.AvatarURL != nil {
		refImage = *m.AvatarURL
	}
	return line, refImage, &m
}

// ConfirmVideo 用户确认脚本草稿后才真正下发视频生成。
// personaID 非空时把所选人设(数字人)注入 videoPrompt,保证出镜的是同一张脸。
// 幂等:已生成过则直接返回现有视频;用 jsonb 原子认领 draft 防双击重复出片。
func (s *AgentService) ConfirmVideo(ctx context.Context, wsID, taskID uuid.UUID, personaID *uuid.UUID) (*model.Video, error) {
	var t model.AgentTask
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", taskID, wsID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("任务不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询任务失败", err)
	}
	if t.Agent != model.AgentDirector || t.Status != model.TaskDone {
		return nil, apperr.BadRequest("该任务没有可生成的脚本")
	}
	var d directorDraft
	if len(t.Metadata) > 0 {
		_ = json.Unmarshal(t.Metadata, &d)
	}
	if d.VideoID != "" {
		if vid, e := uuid.Parse(d.VideoID); e == nil {
			if v, e := s.videos.Get(ctx, wsID, vid); e == nil {
				return v, nil
			}
		}
	}
	if !d.Draft || strings.TrimSpace(d.VideoPrompt) == "" {
		return nil, apperr.BadRequest("脚本草稿缺失,请重新派活生成脚本")
	}
	// 确认时没选人设,回落派活阶段预选的(创作页 composer 选过就不必再选一遍)。
	if personaID == nil && d.PreferredPersonaID != "" {
		if pid, e := uuid.Parse(d.PreferredPersonaID); e == nil {
			personaID = &pid
		}
	}

	// 原子认领草稿:并发/双击时只有一个请求能翻掉 draft 标记。
	claim := s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Where("id = ? AND metadata->>'draft' = 'true'", taskID).
		Update("metadata", gorm.Expr(`metadata || '{"draft":false}'::jsonb`))
	if claim.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "确认失败", claim.Error)
	}
	if claim.RowsAffected == 0 {
		return nil, apperr.BadRequest("视频已在生成中,请稍候刷新")
	}
	restoreDraft := func() {
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Update("metadata", gorm.Expr(`metadata || '{"draft":true}'::jsonb`))
	}

	vi := VideoInput{
		Title: d.Title, Prompt: d.VideoPrompt, Style: normalizeStyle(d.Style),
		DurationSec: d.DurationSec, AspectRatio: d.AspectRatio,
		FirstFrameURL: d.FirstFrameURL,
	}
	if d.ProductID != "" {
		vi.ProductID = &d.ProductID
	}
	var persona *model.ModelAsset
	if personaID != nil {
		if line, ref, asset := s.personaPrompt(ctx, wsID, *personaID); asset != nil {
			vi.Prompt += line
			vi.ModelAssetID = &asset.ID
			// 商品实拍图优先级更高(真货入画);没有商品图时用人设场景照锚定脸。
			if vi.FirstFrameURL == "" && ref != "" {
				vi.FirstFrameURL = ref
			}
			persona = asset
		}
	}
	v, err := s.videos.Create(ctx, wsID, vi)
	if err != nil {
		restoreDraft() // 没花出去钱,把草稿还给用户重试
		return nil, err
	}
	s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", v.ID).Update("script", d.Script)
	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
		Update("metadata", gorm.Expr(`metadata || ?::jsonb`, fmt.Sprintf(`{"videoId":%q}`, v.ID.String())))
	if persona != nil {
		s.db.WithContext(ctx).Model(&model.ModelAsset{}).Where("id = ?", persona.ID).
			Update("usage_count", gorm.Expr("usage_count + 1"))
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Update("metadata", gorm.Expr(`metadata || ?::jsonb`,
				fmt.Sprintf(`{"personaId":%q,"personaName":%q}`, persona.ID.String(), persona.Name)))
	}

	// 封面:有商品实拍图(即首帧)直接用,和成片首帧一致还省一次生图;否则 fal flux 兜底。
	if d.FirstFrameURL != "" {
		s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", v.ID).
			Update("thumbnail_url", d.FirstFrameURL)
	} else {
		vid, prompt, ar := v.ID, d.VideoPrompt, d.AspectRatio
		go func() {
			cctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			s.videos.GenerateCover(cctx, vid, prompt, ar)
		}()
	}
	return v, nil
}
