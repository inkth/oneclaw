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
	modelURL := s.modelAvatarURL(ctx, wsID, *opts.PersonaID)
	if modelURL == "" {
		return "", nil, llm.Usage{}, apperr.BadRequest("该模特没有可用的形象图,请换一位或先在「资产 → 模特」补图")
	}

	// 服饰图:上传素材优先,其次选品库商品主图。
	garmentURL := ""
	if opts.MaterialID != nil {
		garmentURL = s.materialImageURL(ctx, wsID, *opts.MaterialID)
	}
	if garmentURL == "" && opts.ProductID != nil {
		if _, cover, _, ok := s.productFacts(ctx, wsID, *opts.ProductID); ok {
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

	go s.runTryOnImage(taskID, modelURL, garmentURL)

	meta := map[string]any{
		"imagesStatus": listingImagesRunning,
		"modelUrl":     modelURL,
		"garmentUrl":   garmentURL,
	}
	out := "🧥 已开始虚拟试穿:把所选服饰穿到模特身上,生成上身效果图。出图约需 10–60 秒,完成后会自动显示。"
	return out, meta, llm.Usage{}, nil
}

// runTryOnImage 后台调 fal 试穿模型 → 传 COS → 回写 metadata(images + imagesStatus)。
func (s *AgentService) runTryOnImage(taskID uuid.UUID, modelURL, garmentURL string) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()

	fail := func(reason string, err error) {
		logger.Warn("[agent] 虚拟试穿失败:"+reason,
			logger.String("task", taskID.String()), logger.Err(err))
		rctx, rcancel := context.WithTimeout(context.Background(), 10*time.Second)
		s.quota.Refund(rctx, taskID, model.UsageImage)
		rcancel()
		s.writeTryOnMeta(map[string]any{"imagesStatus": listingImagesFailed})(taskID)
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
	url, err := s.storage.Put(ctx, fmt.Sprintf("tryon/%s/result%s", taskID, ext), data, ct)
	if err != nil {
		fail("上传结果失败", err)
		return
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

// modelAvatarURL 取模特形象图(自有或全局预置均可),供试穿/出镜参考。
func (s *AgentService) modelAvatarURL(ctx context.Context, wsID, modelID uuid.UUID) string {
	var m model.ModelAsset
	err := s.db.WithContext(ctx).
		Where("id = ? AND (workspace_id = ? OR is_preset = TRUE)", modelID, wsID).
		First(&m).Error
	if err != nil || m.AvatarURL == nil {
		return ""
	}
	return *m.AvatarURL
}
