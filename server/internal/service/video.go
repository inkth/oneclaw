package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
	"github.com/oneclaw/server/internal/storage"
)

// VideoService 走 OpenRouter /api/v1/videos 异步生成视频(提交 → goroutine 轮询)。
// 完成后若 COS 已配置,把视频转存到 COS 永久化(OpenRouter content URL 需 key 才能取)。
type VideoService struct {
	db      *gorm.DB
	llm     *llm.Client
	storage *storage.Storage
}

func NewVideoService(db *gorm.DB, l *llm.Client, st *storage.Storage) *VideoService {
	return &VideoService{db: db, llm: l, storage: st}
}

type VideoInput struct {
	Title       string  `json:"title"`
	Prompt      string  `json:"prompt" binding:"required"`
	DurationSec int     `json:"durationSec"`
	AspectRatio string  `json:"aspectRatio"`
	Resolution  string  `json:"resolution"`
	Style       string  `json:"style"`
	ProductID   *string `json:"productId"`
}

func (s *VideoService) List(ctx context.Context, wsID uuid.UUID) ([]model.Video, error) {
	var items []model.Video
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("created_at DESC").Limit(60).
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询视频失败", err)
	}
	return items, nil
}

func (s *VideoService) Get(ctx context.Context, wsID, vid uuid.UUID) (*model.Video, error) {
	var v model.Video
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", vid, wsID).First(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("视频不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询视频失败", err)
	}
	return &v, nil
}

// Create 建记录 → 提交 OpenRouter 视频任务 → 起 goroutine 轮询。立即返回 GENERATING 记录。
func (s *VideoService) Create(ctx context.Context, wsID uuid.UUID, in VideoInput) (*model.Video, error) {
	if !s.llm.Configured() {
		return nil, apperr.New(apperr.CodeServiceUnavailable, "AI 未配置:请设置 OPENROUTER_API_KEY")
	}
	dur := in.DurationSec
	if dur <= 0 {
		dur = 5
	}
	ar := in.AspectRatio
	if ar == "" {
		ar = "9:16"
	}
	style := in.Style
	if style == "" {
		style = model.VideoStyleScene
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = firstN(in.Prompt, 40)
	}
	v := model.Video{
		WorkspaceID: wsID, Title: title, Style: style, DurationSec: dur, AspectRatio: ar,
		Prompt: &in.Prompt, Processing: model.VideoPending,
	}
	if in.ProductID != nil {
		if pid, err := uuid.Parse(*in.ProductID); err == nil {
			v.ProductID = &pid
		}
	}
	if err := s.db.WithContext(ctx).Create(&v).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建视频记录失败", err)
	}

	job, err := s.llm.SubmitVideo(ctx, llm.VideoParams{
		Prompt: in.Prompt, DurationSec: dur, AspectRatio: ar, Resolution: in.Resolution,
	})
	if err != nil {
		s.markVideoFailed(ctx, v.ID, err.Error())
		v.Processing = model.VideoFailed
		msg := err.Error()
		v.ErrorMessage = &msg
		return &v, nil
	}
	engine := s.llm.VideoModel()
	updates := map[string]any{
		"processing": model.VideoGenerating, "engine": engine,
		"provider_job_id": job.ID, "polling_url": job.PollingURL,
	}
	s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", v.ID).Updates(updates)
	v.Processing = model.VideoGenerating
	v.Engine = &engine
	v.PollingURL = &job.PollingURL

	go s.pollLoop(v.ID, job.PollingURL)
	return &v, nil
}

// Refresh 手动查一次任务状态并更新(供前端轮询/补偿)。
func (s *VideoService) Refresh(ctx context.Context, wsID, vid uuid.UUID) (*model.Video, error) {
	v, err := s.Get(ctx, wsID, vid)
	if err != nil {
		return nil, err
	}
	if v.Processing != model.VideoGenerating && v.Processing != model.VideoPending {
		return v, nil
	}
	if v.PollingURL == nil || *v.PollingURL == "" {
		return v, nil
	}
	job, err := s.llm.PollVideo(ctx, *v.PollingURL)
	if err != nil {
		return v, nil // 轮询失败不报错,保持 GENERATING,下次再试
	}
	s.applyJob(ctx, v.ID, job)
	return s.Get(ctx, wsID, vid)
}

func (s *VideoService) pollLoop(videoID uuid.UUID, pollingURL string) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			s.markVideoFailed(ctx, videoID, "panic in pollLoop")
		}
	}()
	for {
		select {
		case <-ctx.Done():
			s.markVideoFailed(ctx, videoID, "生成超时")
			return
		case <-time.After(6 * time.Second):
		}
		job, err := s.llm.PollVideo(ctx, pollingURL)
		if err != nil {
			continue // 暂时性错误,继续轮询
		}
		if done := s.applyJob(ctx, videoID, job); done {
			return
		}
	}
}

// applyJob 把任务状态写回 Video。返回 true 表示已终态(completed/failed)。
func (s *VideoService) applyJob(ctx context.Context, videoID uuid.UUID, job *llm.VideoJob) bool {
	switch job.Status {
	case "completed":
		updates := map[string]any{"processing": model.VideoCompleted}
		if len(job.UnsignedURLs) > 0 {
			url := job.UnsignedURLs[0]
			// COS 已配置则转存永久化(否则原 URL 需带 key 才能播)。
			if s.storage.Configured() {
				if cosURL, err := s.rehostToCOS(ctx, videoID, url); err == nil {
					url = cosURL
				} else {
					logger.Warn("[video] 转存 COS 失败,保留原 URL", logger.String("video", videoID.String()), logger.Err(err))
				}
			}
			updates["video_url"] = url
		}
		if job.Usage.Cost > 0 {
			updates["cost_cents"] = llm.VideoCostCents(job.Usage.Cost)
		}
		s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", videoID).Updates(updates)
		logger.Info("[video] 生成完成", logger.String("video", videoID.String()))
		return true
	case "failed", "cancelled", "expired":
		msg := job.Error
		if msg == "" {
			msg = "视频生成" + job.Status
		}
		s.markVideoFailed(ctx, videoID, msg)
		return true
	default:
		return false // pending / in_progress
	}
}

// GenerateCover 用图像模型生成封面 → 上传 COS → 回写 thumbnail_url(best-effort)。
func (s *VideoService) GenerateCover(ctx context.Context, videoID uuid.UUID, prompt, aspectRatio string) {
	if !s.llm.Configured() || !s.storage.Configured() {
		return
	}
	data, ct, err := s.llm.GenerateImage(ctx, "竖屏短视频封面海报,无文字:"+prompt, aspectRatio)
	if err != nil {
		logger.Warn("[video] 封面生成失败", logger.String("video", videoID.String()), logger.Err(err))
		return
	}
	ext := ".png"
	if strings.Contains(ct, "jpeg") || strings.Contains(ct, "jpg") {
		ext = ".jpg"
	}
	url, err := s.storage.Put(ctx, "thumbnails/"+videoID.String()+ext, data, ct)
	if err != nil {
		logger.Warn("[video] 封面上传失败", logger.String("video", videoID.String()), logger.Err(err))
		return
	}
	s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", videoID).Update("thumbnail_url", url)
}

// rehostToCOS 拉取 OpenRouter 视频字节(带 key)→ 上传 COS,返回永久 URL。
func (s *VideoService) rehostToCOS(ctx context.Context, videoID uuid.UUID, srcURL string) (string, error) {
	data, ct, err := s.llm.Download(ctx, srcURL)
	if err != nil {
		return "", err
	}
	if ct == "" {
		ct = "video/mp4"
	}
	ext := ".mp4"
	if strings.Contains(ct, "webm") {
		ext = ".webm"
	}
	key := "videos/" + videoID.String() + ext
	return s.storage.Put(ctx, key, data, ct)
}

func (s *VideoService) markVideoFailed(ctx context.Context, videoID uuid.UUID, msg string) {
	s.db.WithContext(ctx).Model(&model.Video{}).Where("id = ?", videoID).
		Updates(map[string]any{"processing": model.VideoFailed, "error_message": msg})
}

func firstN(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= n {
		return string(r)
	}
	return string(r[:n]) + "…"
}
