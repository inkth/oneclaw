package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

// ── 虚拟试穿(TRYON):模特图 + 服饰图 → fal 试穿模型出上身图 ───────────────────
//
// 与 Listing/Director 不同,试穿不经 LLM:派活时即解析两张输入图、扣出图额度、
// 后台异步出图,前端按 imagesStatus 轮询。模特取自模特资产(opts.PersonaID),
// 服饰图取自上传素材(opts.MaterialID)或选品库商品主图(opts.ProductID)。

// runTryOn 解析模特/服饰输入图 → 扣出图额度 → 起后台出图。立即返回 PENDING 态。
func (s *AgentService) runTryOn(ctx context.Context, taskID, wsID uuid.UUID, opts AgentCreateOpts) (string, any, llm.Usage, error) {
	if !s.fal.Configured() || !s.storage.Configured() {
		return "", nil, llm.Usage{}, apperr.BadRequest("试穿服务未配置(需要 FALAI_API_KEY 与 COS)")
	}
	if opts.PersonaID == nil {
		return "", nil, llm.Usage{}, apperr.BadRequest("请先选择一位模特")
	}
	modelURL := s.tryOnModelURL(ctx, wsID, *opts.PersonaID)
	if modelURL == "" {
		return "", nil, llm.Usage{}, apperr.BadRequest("该模特没有可用的形象图,请换一位或先在「资产 → 模特」补图")
	}

	// 服饰图:上传素材优先,其次选品库商品主图。
	garmentURL := ""
	if opts.MaterialID != nil {
		garmentURL = s.materialImageURL(ctx, wsID, *opts.MaterialID)
	}
	if garmentURL == "" && opts.ProductID != nil {
		if _, cover, _, _, ok := s.productFacts(ctx, wsID, *opts.ProductID, false); ok {
			garmentURL = cover
		}
	}
	if garmentURL == "" {
		return "", nil, llm.Usage{}, apperr.BadRequest("请上传服饰图或从选品库选一个带主图的商品")
	}

	// 出图额度前置:超额直接拒绝(任务终态失败时 fail() 退回派活额度,这笔出图额度在出图失败时退)。
	if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageImage, 1, &taskID); err != nil {
		return "", nil, llm.Usage{}, err
	}

	go s.runTryOnImage(taskID, wsID, modelURL, garmentURL)

	meta := map[string]any{
		"imagesStatus": listingImagesRunning,
		"modelUrl":     modelURL,
		"garmentUrl":   garmentURL,
	}
	out := "🧥 已开始虚拟试穿:把所选服饰穿到模特身上,生成上身效果图。出图约需 10–60 秒,完成后会自动显示。"
	return out, meta, llm.Usage{}, nil
}

// runTryOnImage 后台调 fal 试穿模型 → 传 COS → 回写 metadata(images + imagesStatus)→ 登记素材库。
func (s *AgentService) runTryOnImage(taskID, wsID uuid.UUID, modelURL, garmentURL string) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()

	fail := func(reason string, err error) {
		logger.Warn("[agent] 虚拟试穿失败:"+reason,
			logger.String("task", taskID.String()), logger.Err(err))
		rctx, rcancel := context.WithTimeout(context.Background(), 10*time.Second)
		s.quota.Refund(rctx, taskID, model.UsageImage)
		// 试穿无文字产出,出图失败=整单无价值,派活分一并退,前端「积分已退回」才名副其实。
		s.quota.Refund(rctx, taskID, model.UsageAgentTask)
		rcancel()
		s.writeTryOnMeta(map[string]any{
			"imagesStatus": listingImagesFailed,
			"imagesError":  tryOnFailHint(err),
		})(taskID)
	}

	// 服饰图永久化到自有 COS 再喂 fal:选品库商品主图常是 EchoTik 带签名的临时 URL
	// (约 3 天过期),隔天发起试穿 fal 会拉不到图。复用发现页封面转存(命中缓存免重复
	// 下载、失败回退原 URL);非自有 COS 才转。best-effort,不阻断出图。
	if s.discover != nil && garmentURL != "" && !strings.Contains(garmentURL, "myqcloud.com") {
		if m := s.discover.rehostCovers(ctx, []string{garmentURL}); m[garmentURL] != "" {
			garmentURL = m[garmentURL]
		}
	}

	data, ct, err := s.fal.TryOn(ctx, modelURL, garmentURL)
	if err != nil {
		fail("fal 出图失败", err)
		return
	}
	ext := ".jpg"
	if strings.Contains(ct, "png") {
		ext = ".png"
	}
	key := fmt.Sprintf("tryon/%s/result%s", taskID, ext)
	url, err := s.storage.Put(ctx, key, data, ct)
	if err != nil {
		fail("上传结果失败", err)
		return
	}
	// 把这张真人上身图登记进素材库(指向同一 COS 对象,不重复上传):做视频选首帧/参考图时可直接复用,
	// 试穿不再是断头路。best-effort:登记失败不影响出图展示(出图才是主交付)。
	ctCopy := ct
	mat := model.Material{
		WorkspaceID:  wsID,
		Type:         "IMAGE",
		OriginalName: fmt.Sprintf("虚拟试穿-%s%s", taskID.String()[:8], ext),
		URL:          url,
		StorageKey:   &key,
		ContentType:  &ctCopy,
		SizeBytes:    int64(len(data)),
		Tags:         []string{"虚拟试穿", "上身图"},
	}
	if err := s.db.WithContext(ctx).Create(&mat).Error; err != nil {
		logger.Warn("[agent] 试穿结果登记素材库失败",
			logger.String("task", taskID.String()), logger.Err(err))
	}
	s.writeTryOnMeta(map[string]any{
		"imagesStatus": listingImagesDone,
		"images":       []string{url},
	})(taskID)
}

// writeTryOnMeta 用独立 ctx 把 metadata 增量合并回任务(出图耗时长,回写不能被在线 ctx 取消)。
func (s *AgentService) writeTryOnMeta(patch map[string]any) func(uuid.UUID) {
	return func(taskID uuid.UUID) {
		b, _ := json.Marshal(patch)
		wctx, wcancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer wcancel()
		s.db.WithContext(wctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
			Update("metadata", gorm.Expr(`metadata || ?::jsonb`, string(b)))
	}
}

// tryOnModelURL 取模特用于试穿的形象图。fashn 试穿要先在图里识别人体姿态,正脸大头照
// (AvatarURL)会被判 "Failed to detect body pose" 而 422 失败,故优先用半身图
// (PreviewURL,预置人设的 waist-up 镜头);自有模特没半身图时再退回 AvatarURL。
func (s *AgentService) tryOnModelURL(ctx context.Context, wsID, modelID uuid.UUID) string {
	var m model.ModelAsset
	err := s.db.WithContext(ctx).
		Where("id = ? AND (workspace_id = ? OR is_preset = TRUE)", modelID, wsID).
		First(&m).Error
	if err != nil {
		return ""
	}
	if m.PreviewURL != nil && strings.TrimSpace(*m.PreviewURL) != "" {
		return *m.PreviewURL
	}
	if m.AvatarURL != nil {
		return *m.AvatarURL
	}
	return ""
}

// tryOnFailHint 把 fal 的技术报错翻成给用户的可操作提示(展示在失败卡片下方)。
func tryOnFailHint(err error) string {
	msg := ""
	if err != nil {
		msg = strings.ToLower(err.Error())
	}
	switch {
	case strings.Contains(msg, "body pose") || strings.Contains(msg, "person_image") || strings.Contains(msg, "model image"):
		return "没识别到模特的人体姿态,请换一位模特、或为该模特补一张露出上半身/全身的形象图,再重新发起试穿。"
	case strings.Contains(msg, "garment") || strings.Contains(msg, "cloth"):
		return "没识别到服饰,请换一张更清晰的服饰平铺图(建议单件、白底)。注意保健品、3C 等非服装类目无法试穿。"
	default:
		return "可换一位模特或换一张更清晰的服饰平铺图,重新发起试穿。"
	}
}
