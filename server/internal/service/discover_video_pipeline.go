package service

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

// 热门视频管线下载超时:热门带货短视频体积通常几~几十 MB,给足 120s(交互式解析仍用 60s)。
const hotVideoDownloadTimeout = 120 * time.Second

// zeroTimeSentinel 用于「analyzed_at 未设」的 SQL 判据:GORM 把 time.Time 零值写成 '0001-01-01'(非 NULL),
// 任何真实拆解时间都远晚于 1970,故 analyzed_at < 此哨兵 等价于 AnalyzedAt.IsZero()。
var zeroTimeSentinel = time.Unix(0, 0)

// StartVideoPipeline 启动「爆款视频永久化 + AI 拆解」后台管线。
// 对某站点 sale_cnt>阈值 的热门视频:下载无水印 mp4 转存 COS(站内可直接播放,不跳 TikTok)
// + 复用多模态管线做 AI 拆解落库。ctx 为应用生命周期(非请求 ctx),取消即退出。
// 需 EchoTik + COS + LLM 三者都配置才启动(缺一无意义,直接跳过)。
func (s *DiscoverService) StartVideoPipeline(ctx context.Context, cfg config.DiscoverVideoPipelineConfig) {
	if !cfg.Enabled {
		return
	}
	if s.db == nil || !s.echo.Configured() || s.storage == nil || !s.storage.Configured() || !s.llm.Configured() {
		logger.Info("[video-pipeline] 依赖未就绪(EchoTik/COS/LLM),已跳过")
		return
	}
	if cfg.Interval <= 0 {
		cfg.Interval = 10 * time.Minute
	}
	go func() {
		// 启动后稍等,避开进程冷启动与迁移。
		select {
		case <-ctx.Done():
			return
		case <-time.After(30 * time.Second):
		}
		s.runVideoPipelineOnce(ctx, cfg)
		ticker := time.NewTicker(cfg.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.runVideoPipelineOnce(ctx, cfg)
			}
		}
	}()
	logger.Info("[video-pipeline] 已启动",
		logger.String("region", cfg.Region),
		logger.Int("saleThreshold", cfg.SaleThreshold),
		logger.Int("perRun", cfg.PerRun))
}

// runVideoPipelineOnce 扫表认领一批待处理视频(按销量优先),并发处理。
// 转存与拆解各自独立认领 + 幂等,一次下载可同时喂两路(processVideo 内共享字节)。
func (s *DiscoverService) runVideoPipelineOnce(ctx context.Context, cfg config.DiscoverVideoPipelineConfig) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("[video-pipeline] runOnce panic", logger.Any("recover", r))
		}
	}()

	// 认领:需转存(video_url 空)或需拆解(analyzed_at 未设)且未超退避上限,按销量降序取前 PerRun。
	// 注:analyzed_at 由 upsertVideoList 插入为 Go 零值('0001-01-01',非 NULL,与 detail_fetched_at 等同源),
	// 故「未拆解」判据须用零时哨兵而非 IS NULL——与 processHotVideo 的 AnalyzedAt.IsZero() 对齐。
	var rows []model.DiscoverVideo
	err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND sale_cnt > ?", providerEchoTik, cfg.Region, cfg.SaleThreshold).
		Where(
			s.db.Where("video_url = '' AND video_attempts < ?", cfg.MaxAttempts).
				Or("(analyzed_at IS NULL OR analyzed_at < ?) AND analysis_attempts < ?", zeroTimeSentinel, cfg.MaxAttempts),
		).
		Order("sale_cnt DESC").
		Limit(cfg.PerRun).
		Find(&rows).Error
	if err != nil {
		logger.Warn("[video-pipeline] 认领候选失败", logger.Err(err))
		return
	}
	if len(rows) == 0 {
		return
	}

	conc := cfg.Concurrency
	if conc <= 0 {
		conc = 1
	}
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(conc)
	for i := range rows {
		dv := rows[i]
		g.Go(func() error {
			s.processHotVideo(gctx, dv)
			return nil // 单条失败不中断整批(内部自行退避)
		})
	}
	_ = g.Wait()
	logger.Info("[video-pipeline] 一轮完成", logger.Int("claimed", len(rows)))
}

// processHotVideo 处理一条热门视频:①下载无水印 mp4 转存 COS ②多模态 AI 拆解。
// 两支路各自独立幂等;若同轮都要做,只下载一次字节喂两路。任一支路失败只 attempt++ 退避,不阻断另一路/其他视频。
func (s *DiscoverService) processHotVideo(ctx context.Context, dv model.DiscoverVideo) {
	needVideo := dv.VideoURL == ""
	needAnalysis := dv.AnalyzedAt.IsZero()
	if !needVideo && !needAnalysis {
		return
	}

	var raw []byte // 本轮下载的视频字节,转存/拆解共享

	// ── 支路 1:下载 + 转存 COS ──
	if needVideo {
		info, err := s.echo.GetVideoDownloadURL(ctx, dv.ExternalID, dv.Region)
		if err != nil || info == nil || info.BestURL() == "" {
			s.bumpVideoAttempt(ctx, dv.ID)
			logger.Warn("[video-pipeline] 取下载地址失败", logger.String("videoId", dv.ExternalID), logger.Err(err))
			return // 拿不到源,拆解也无从做,本轮放弃(下轮重试)
		}
		b, derr := downloadVideoBytesTimeout(ctx, info.BestURL(), hotVideoDownloadTimeout)
		if derr != nil || len(b) == 0 {
			s.bumpVideoAttempt(ctx, dv.ID)
			logger.Warn("[video-pipeline] 下载视频失败", logger.String("videoId", dv.ExternalID), logger.Err(derr))
			return
		}
		key := "videos/echotik/" + sha1Hex(dv.ExternalID+"|"+dv.Region) + ".mp4"
		cosURL, perr := s.storage.Put(ctx, key, b, "video/mp4")
		if perr != nil {
			s.bumpVideoAttempt(ctx, dv.ID)
			logger.Warn("[video-pipeline] 转存 COS 失败", logger.String("videoId", dv.ExternalID), logger.Err(perr))
			return
		}
		if e := s.db.WithContext(ctx).Model(&model.DiscoverVideo{}).
			Where("id = ?", dv.ID).Update("video_url", cosURL).Error; e != nil {
			logger.Warn("[video-pipeline] 回写 video_url 失败", logger.Err(e))
		}
		dv.VideoURL = cosURL
		raw = b
		logger.Info("[video-pipeline] 已转存", logger.String("videoId", dv.ExternalID))
	}

	if !needAnalysis {
		return
	}

	// ── 支路 2:多模态 AI 拆解 ──
	if raw == nil { // 支路 1 未触发(视频已转存过),从 COS 永久地址下载字节
		if dv.VideoURL == "" {
			return
		}
		b, derr := downloadVideoBytesTimeout(ctx, dv.VideoURL, hotVideoDownloadTimeout)
		if derr != nil || len(b) == 0 {
			s.bumpAnalysisAttempt(ctx, dv.ID)
			logger.Warn("[video-pipeline] 拆解取字节失败", logger.String("videoId", dv.ExternalID), logger.Err(derr))
			return
		}
		raw = b
	}

	audio, frames, err := extractAudioAndFrames(ctx, raw)
	if err != nil || (audio == nil && len(frames) == 0) {
		s.bumpAnalysisAttempt(ctx, dv.ID)
		logger.Warn("[video-pipeline] 抽音轨/帧失败", logger.String("videoId", dv.ExternalID), logger.Err(err))
		return
	}
	out, _, err := analyzeVideoTwoStage(ctx, s.llm, "", audio, frames)
	if err != nil {
		s.bumpAnalysisAttempt(ctx, dv.ID)
		logger.Warn("[video-pipeline] 多模态拆解失败", logger.String("videoId", dv.ExternalID), logger.Err(err))
		return
	}
	analysisJSON, _ := json.Marshal(out)
	if e := s.db.WithContext(ctx).Model(&model.DiscoverVideo{}).
		Where("id = ?", dv.ID).
		Updates(map[string]any{"analysis": model.JSONB(analysisJSON), "analyzed_at": time.Now()}).Error; e != nil {
		logger.Warn("[video-pipeline] 回写 analysis 失败", logger.Err(e))
		return
	}
	logger.Info("[video-pipeline] 已拆解", logger.String("videoId", dv.ExternalID), logger.Int("lines", len(out.Lines)))
}

func (s *DiscoverService) bumpVideoAttempt(ctx context.Context, id uuid.UUID) {
	s.db.WithContext(ctx).Model(&model.DiscoverVideo{}).Where("id = ?", id).
		UpdateColumn("video_attempts", gorm.Expr("video_attempts + 1"))
}

func (s *DiscoverService) bumpAnalysisAttempt(ctx context.Context, id uuid.UUID) {
	s.db.WithContext(ctx).Model(&model.DiscoverVideo{}).Where("id = ?", id).
		UpdateColumn("analysis_attempts", gorm.Expr("analysis_attempts + 1"))
}

func sha1Hex(s string) string {
	sum := sha1.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}
