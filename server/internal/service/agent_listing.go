package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // 注册 PNG 解码器:Seedream 出 PNG,toJPEG 需能解码
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

// ── Listing:标题 / 五点卖点 / A+ 结构 / 主图(prompt → 用户确认 → fal 出图)──────

const listingSystem = `你是 发现猫 的"Listing 内容 Agent",服务 TikTok Shop 跨境卖家。
根据用户的商品描述,产出一套可直接上架的 Listing 内容。

如果用户消息附带「商品档案」,以档案里的真实卖点、价格、市场数据为准:
标题和五点要体现这些具体信息,绝对不要编造数字。

如果随消息附带了商品照片,先看图:标题、五点、A+ 必须基于照片里实际可见的
商品形态/材质/颜色/卖点来写,不要编造照片中看不到的规格或参数。

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

// 主图出图状态机(metadata.imagesStatus):
// PENDING(等用户确认)→ RUNNING(出图中)→ DONE/FAILED;FAILED 可重试再认领。
const (
	listingImagesPending = "PENDING"
	listingImagesRunning = "RUNNING"
	listingImagesDone    = "DONE"
	listingImagesFailed  = "FAILED"

	// 单次确认最多出几张主图(控制 fal 成本;余下 prompt 仍展示给用户)。
	listingMaxImages = 3
)

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

func (s *AgentService) runListing(ctx context.Context, wsID uuid.UUID, input string, opts AgentCreateOpts) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请设置 OPENROUTER_API_KEY")
	}
	productID := opts.ProductID
	user := input
	coverURL := ""
	if productID != nil {
		if facts, cover, _, _, ok := s.productFacts(ctx, wsID, *productID, false); ok {
			user = fmt.Sprintf("%s\n\n商品档案(选品库真实数据):\n%s", input, facts)
			coverURL = cover
		} else {
			// 商品查不到就当没传,避免把产出挂到无效商品上
			productID = nil
		}
	}
	// 出图参考优先商品实拍主图(真货入画);没有商品图时用用户指定的素材图兜底。
	if coverURL == "" && opts.MaterialID != nil {
		coverURL = s.materialImageURL(ctx, wsID, *opts.MaterialID)
	}
	if coverURL != "" {
		user += "\n注:已有实拍参考图,出图时会作为参考让真货入画;imagePrompts 请围绕这个商品本身设计构图(白底/场景/细节/对比)。"
	}
	// 解析一次 LLM 输出为 listingOut;空/截断/无效都算失败(交给调用方决定是否降级)。
	parseListing := func(r *llm.Result) (listingOut, bool) {
		var o listingOut
		if r == nil {
			return o, false
		}
		if json.Unmarshal([]byte(llm.ExtractJSON(r.Content)), &o) != nil {
			return o, false
		}
		if o.Title == "" || len(o.SellingPoints) == 0 {
			return o, false
		}
		return o, true
	}

	// 有实拍图就让 vision 模型看图写文案(标题/五点基于照片里的真货);vision 走 ReviewModel
	// (gemini,prod 经代理)。但 gemini 经代理偶发「无报错却返回空/截断内容」,故不仅 transport
	// 错误要降级,**解析失败(空/截断/无效)也降级**回纯文本(deepseek,prod 稳定),保证 Listing 出得来。
	var res *llm.Result
	var out listingOut
	ok := false
	if coverURL != "" {
		if r, e := s.llm.ChatVision(ctx, s.llm.ReviewModel(), listingSystem, user, []string{coverURL}, true, 3000); e != nil {
			logger.Warn("[agent] listing vision 看图失败,降级回纯文本",
				logger.String("workspace", wsID.String()), logger.Err(e))
		} else if o, good := parseListing(r); good {
			res, out, ok = r, o, true
		} else {
			logger.Warn("[agent] listing vision 返回空/无效内容,降级回纯文本",
				logger.String("workspace", wsID.String()))
		}
	}
	if !ok {
		r, e := s.llm.Chat(ctx, listingSystem, user, true, 2200)
		if e != nil {
			return "", nil, llm.Usage{}, e
		}
		o, good := parseListing(r)
		if !good {
			return "", nil, llm.Usage{}, fmt.Errorf("模型未给出有效的 Listing 内容")
		}
		res, out = r, o
	}

	// 出图能力就绪才进入确认流程,否则只给 prompt(前端不出按钮)。
	canImage := s.fal.Configured() && s.storage.Configured() && len(out.ImagePrompts) > 0

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
	if canImage {
		if coverURL != "" {
			b.WriteString("\n\n🖼 已取该商品的实拍主图作为出图参考,生成的主图里就是你的真货。")
		}
		b.WriteString("\n📸 文案满意就点下方「生成 Listing 主图」,把主图方案直接出成图;确认后才消耗生成额度。")
	}

	meta := map[string]any{
		"title":         out.Title,
		"sellingPoints": out.SellingPoints,
		"aplusSections": out.AplusSections,
		"imagePrompts":  out.ImagePrompts,
		"hashtags":      out.Hashtags,
	}
	if productID != nil {
		meta["productId"] = productID.String()
	}
	if coverURL != "" {
		meta["coverUrl"] = coverURL
	}
	if canImage {
		meta["imagesStatus"] = listingImagesPending
	}
	return b.String(), meta, res.Usage, nil
}

// listingDraft 是 LISTING 任务 metadata 里的出图素材(runListing 写入,GenerateListingImages 消费)。
type listingDraft struct {
	ImagePrompts []string `json:"imagePrompts"`
	ImagesStatus string   `json:"imagesStatus"`
	CoverURL     string   `json:"coverUrl"`
	Images       []string `json:"images"`
	ProductID    string   `json:"productId"` // 关联选品库商品:出图完成后回写为商品主图
}

// GenerateListingImages 用户确认主图方案后才真正出图(消耗 fal 生成额度)。
// 幂等:已出过图直接返回;用 jsonb 原子认领 imagesStatus 防双击重复出图。
func (s *AgentService) GenerateListingImages(ctx context.Context, wsID, taskID uuid.UUID) (*model.AgentTask, error) {
	var t model.AgentTask
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", taskID, wsID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("任务不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询任务失败", err)
	}
	if t.Agent != model.AgentListing || t.Status != model.TaskDone {
		return nil, apperr.BadRequest("该任务没有可生成的主图方案")
	}
	if !s.fal.Configured() || !s.storage.Configured() {
		return nil, apperr.BadRequest("出图服务未配置(需要 FALAI_API_KEY 与 COS)")
	}
	var d listingDraft
	if len(t.Metadata) > 0 {
		_ = json.Unmarshal(t.Metadata, &d)
	}
	if len(d.Images) > 0 {
		return &t, nil
	}
	if len(d.ImagePrompts) == 0 {
		return nil, apperr.BadRequest("该任务没有主图 prompt,请重新派活")
	}

	// 原子认领:PENDING/FAILED → RUNNING,并发/双击时只有一个请求生效。
	claim := s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Where("id = ? AND metadata->>'imagesStatus' IN ('PENDING','FAILED')", taskID).
		Update("metadata", gorm.Expr(`metadata || '{"imagesStatus":"RUNNING"}'::jsonb`))
	if claim.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "确认失败", claim.Error)
	}
	if claim.RowsAffected == 0 {
		return nil, apperr.BadRequest("主图已在生成中,请稍候刷新")
	}

	// 配额前置:按实际会出的张数扣;超额把认领还回 PENDING,用户升级后可再点。
	qty := len(d.ImagePrompts)
	if qty > listingMaxImages {
		qty = listingMaxImages
	}
	if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageImage, qty, &taskID); err != nil {
		s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Update("metadata", gorm.Expr(`metadata || '{"imagesStatus":"PENDING"}'::jsonb`))
		return nil, err
	}

	go s.runListingImages(taskID, wsID, d.ImagePrompts, d.CoverURL, d.ProductID)
	s.db.WithContext(ctx).Where("id = ?", taskID).First(&t)
	return &t, nil
}

// runListingImages 后台并发出图 → 传 COS → 回写 metadata(images + imagesStatus)。
// 部分失败不拖垮整批:有图即 DONE,全军覆没才 FAILED(前端可重试)。
func (s *AgentService) runListingImages(taskID, wsID uuid.UUID, prompts []string, coverURL, productID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	if len(prompts) > listingMaxImages {
		prompts = prompts[:listingMaxImages]
	}

	urls := make([]string, len(prompts))
	var refs []string
	if coverURL != "" {
		refs = []string{coverURL}
	}
	var wg sync.WaitGroup
	for i, p := range prompts {
		wg.Add(1)
		go func(i int, prompt string) {
			defer wg.Done()
			u, err := s.listingImage(ctx, taskID, i, prompt, refs)
			if err != nil {
				logger.Warn("[agent] listing 主图生成失败",
					logger.String("task", taskID.String()), logger.Err(err))
				return
			}
			urls[i] = u
		}(i, p)
	}
	wg.Wait()

	var done []string
	for _, u := range urls {
		if u != "" {
			done = append(done, u)
		}
	}
	status := listingImagesDone
	if len(done) == 0 {
		status = listingImagesFailed
		// 全军覆没退回出图额度(部分成功不退,成本已花)。
		rctx, rcancel := context.WithTimeout(context.Background(), 10*time.Second)
		s.quota.Refund(rctx, taskID, model.UsageImage)
		rcancel()
	}
	patch := map[string]any{"imagesStatus": status}
	if len(done) > 0 {
		patch["images"] = done
	}
	b, _ := json.Marshal(patch)
	// 回写用独立 ctx:出图把 12 分钟耗尽时,状态也必须落库,否则前端会永远停在 RUNNING。
	wctx, wcancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer wcancel()
	s.db.WithContext(wctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
		Update("metadata", gorm.Expr(`metadata || ?::jsonb`, string(b)))

	// 回写商品主图:出图成功且关联了选品库商品时,把第一张设为商品主图。
	// 仅当商品还没主图(未手动设过)才自动写,避免覆盖用户的选择;手动「设为主图」始终覆盖。
	if len(done) > 0 && productID != "" {
		if pid, err := uuid.Parse(productID); err == nil {
			s.db.WithContext(wctx).Model(&model.Product{}).
				Where("id = ? AND workspace_id = ? AND (cover_url IS NULL OR cover_url = '')", pid, wsID).
				Update("cover_url", done[0])
		}
	}
}

// listingImage 生成并上传单张主图(走 fal 队列 API,短请求轮询,跨境不被长连接卡死)。
// 有商品实拍图时用 Seedream edit 以真货为参考锚定外观,否则 text-to-image;每张最多 2 次尝试。
func (s *AgentService) listingImage(ctx context.Context, taskID uuid.UUID, idx int, prompt string, refURLs []string) (string, error) {
	const suffix = ", professional e-commerce product photo, clean composition, photorealistic, no text, no watermark"
	modelPath, refs := personaT2IModel, []string(nil)
	if len(refURLs) > 0 {
		modelPath, refs = personaEditModel, refURLs
		prompt = "the exact same product from the reference photo(s), " + prompt
	}
	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		gctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		data, ct, err := s.fal.GenerateImageQueued(gctx, modelPath, prompt+suffix, "square_hd", refs)
		cancel()
		if err != nil {
			lastErr = err
			continue
		}
		// Seedream 出的是无压缩 PNG(数 MB),商品图不需要这么大:转 JPEG(分辨率不变、肉眼无损)
		// 再传 COS,省存储/带宽、加载更快。转码失败则保留原图,不影响出图。
		data, ct = toJPEG(data, ct)
		return s.storage.Put(ctx, fmt.Sprintf("listing/%s/main-%d.jpg", taskID, idx+1), data, ct)
	}
	return "", lastErr
}

// toJPEG 把图片字节转成 JPEG(q85);解码失败则原样返回(兜底不破坏出图)。
func toJPEG(data []byte, ct string) ([]byte, string) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return data, ct
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return data, ct
	}
	return buf.Bytes(), "image/jpeg"
}
