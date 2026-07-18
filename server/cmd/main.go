// faxianmao-server 入口。
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/job"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/router"
	"github.com/faxianmao/server/internal/service"
	"github.com/faxianmao/server/internal/service/echotik"
	"github.com/faxianmao/server/internal/service/llm"
	"github.com/faxianmao/server/internal/storage"
)

func main() {
	cfg := config.Load()

	if err := logger.Init(cfg.Server.Mode); err != nil {
		panic(err)
	}
	defer logger.Sync()

	if err := cfg.Validate(); err != nil {
		logger.Fatal("配置校验失败", logger.Err(err))
	}

	// PostgreSQL
	db, err := gorm.Open(postgres.Open(cfg.Database.DSN()), &gorm.Config{})
	if err != nil {
		logger.Fatal("数据库连接失败", logger.Err(err))
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 实体榜顺序表:旧 6 列唯一索引 uq_ere_key 必须先删,AutoMigrate 才建含 page_num 的
	// uq_ere_pg;两个索引并存时 ON CONFLICT 目标歧义(写入按 7 列对齐 uq_ere_pg)。
	db.Exec("DROP INDEX IF EXISTS uq_ere_key")

	if err := db.AutoMigrate(
		&model.User{},
		&model.PhoneVerificationCode{},
		&model.Workspace{},
		&model.Membership{},
		&model.Product{},
		&model.DiscoverProduct{},
		&model.RanklistCacheEntry{},
		&model.DiscoverBackfillCursor{},
		&model.DiscoverSnapshot{},
		&model.DiscoverInfluencer{},
		&model.DiscoverInfluencerSnapshot{},
		&model.DiscoverSeller{},
		&model.DiscoverSellerSnapshot{},
		&model.DiscoverVideo{},
		&model.DiscoverVideoSnapshot{},
		&model.EntityRanklistEntry{},
		&model.DiscoverCache{},
		&model.CoverAsset{},
		&model.WorkspaceDiscoverInteraction{},
		&model.WorkspaceDiscoverFavorite{},
		&model.NewsletterSubscription{},
		&model.DemoRequest{},
		&model.PartnerApplication{},
		&model.Shop{},
		&model.ModelAsset{},
		&model.Material{},
		&model.Conversation{},
		&model.AgentTask{},
		&model.Video{},
		&model.CreationTemplate{},
		&model.UsageRecord{},
		&model.PaymentOrder{},
		&model.OverflowBill{},
		&model.Agency{},
		&model.AgencyReferral{},
		&model.AgencyReferralClick{},
		&model.CommissionRecord{},
		&model.AgencyWithdrawal{},
		&model.BonusCreditGrant{},
		&model.AdminAuditLog{},
		&model.Feedback{},
	); err != nil {
		logger.Fatal("表结构迁移失败", logger.Err(err))
	}
	// 新代理邀请码使用 1112-9999 四位数字；历史 8 位码继续有效。
	if err := db.Exec(`CREATE SEQUENCE IF NOT EXISTS agency_invite_code_seq
		START WITH 1112 MINVALUE 1112 MAXVALUE 9999 NO CYCLE`).Error; err != nil {
		logger.Fatal("初始化代理邀请码序列失败", logger.Err(err))
	}
	if err := db.Exec(`
		WITH existing_codes AS (
			SELECT MAX(CASE WHEN code ~ '^[0-9]{4}$' THEN code::bigint END) AS max_code
			FROM agencies
		), sequence_state AS (
			SELECT last_value, is_called FROM agency_invite_code_seq
		)
		SELECT setval(
			'agency_invite_code_seq',
			GREATEST(COALESCE(max_code, 1112), last_value, 1112),
			COALESCE(max_code, 0) >= 1112 OR is_called
		)
		FROM existing_codes, sequence_state
	`).Error; err != nil {
		logger.Fatal("同步代理邀请码序列失败", logger.Err(err))
	}
	// 存量归因在新字段上线后以原绑定时间回填一年计佣截止时间。
	if err := db.Model(&model.AgencyReferral{}).
		Where("commission_eligible_until IS NULL").
		UpdateColumn("commission_eligible_until", gorm.Expr("created_at + INTERVAL '1 year'")).Error; err != nil {
		logger.Fatal("代理商计佣窗口回填失败", logger.Err(err))
	}
	// 商品近窗指标列上线回填:已拉过详情的存量商品把 detail_extras 里的窗口值提到列表列
	// (幂等,只补 0 值行;失败仅告警——展示层数据,不该拦启动)。
	if err := db.Exec(`UPDATE discover_products SET
			sale7d_cnt = COALESCE((detail_extras->'windows'->>'sale7dCnt')::numeric, 0)::int,
			sale30d_cnt = COALESCE((detail_extras->'windows'->>'sale30dCnt')::numeric, 0)::int,
			gmv7d_cents = COALESCE((detail_extras->'windows'->>'gmv7dCents')::numeric, 0)::int,
			gmv30d_cents = COALESCE((detail_extras->'windows'->>'gmv30dCents')::numeric, 0)::int
		WHERE (sale7d_cnt = 0 OR sale30d_cnt = 0) AND detail_extras->'windows'->>'sale7dCnt' IS NOT NULL`).Error; err != nil {
		logger.Warn("商品近窗指标回填失败", logger.Err(err))
	}

	// Services
	agencySvc := service.NewAgencyService(db, cfg.Agency)
	smsSvc := service.NewSMSService(db, &cfg.SMS, cfg.IsDev())
	authSvc := service.NewAuthService(db, cfg, smsSvc, agencySvc)
	wsSvc := service.NewWorkspaceService(db)
	prodSvc := service.NewProductService(db)
	echoClient := echotik.New(cfg.EchoTik)
	store := storage.New(cfg.Storage)
	mktSvc := service.NewMarketingService(db, smsSvc)
	shopSvc := service.NewShopService(db)
	modelSvc := service.NewModelAssetService(db)
	llmClient := llm.New(cfg.OpenRouter)
	discSvc := service.NewDiscoverService(db, echoClient, store, llmClient, cfg.DiscoverSync.EnrichMinSale)
	quotaSvc := service.NewQuotaService(db)
	matSvc := service.NewMaterialService(db, store, llmClient, quotaSvc)
	billingSvc := service.NewBillingService(db, cfg.IsDev(), agencySvc, cfg.Agency.CommissionOnMock)
	adminSvc := service.NewAdminService(db, billingSvc, quotaSvc, agencySvc)
	feedbackSvc := service.NewFeedbackService(db)
	videoSvc := service.NewVideoService(db, llmClient, store, quotaSvc)
	if llmClient.Configured() {
		logger.Info("[image] 出图已配置(OpenRouter seedream)")
	} else {
		logger.Warn("[image] OPENROUTER_API_KEY 未配置,出图/封面不可用")
	}
	// 一次性任务:生成预置人设库(seedream 出图 → COS → model_assets)后退出。
	// 用法:docker compose run --rm go-api ./server --seed-personas
	for _, arg := range os.Args[1:] {
		if arg == "--seed-personas" {
			created, err := service.NewPersonaSeeder(db, llmClient, store).Run(context.Background())
			if err != nil {
				logger.Fatal("[persona] 种子任务失败", logger.Err(err))
			}
			logger.Info("[persona] 种子任务完成", zap.Int("created", created))
			return
		}
		// 一次性:把旧商品收藏(interactions.is_starred)迁成选品候选记录后退出。
		if arg == "--migrate-favorites" {
			m, sk, err := discSvc.MigrateStarredToProducts(context.Background())
			if err != nil {
				logger.Fatal("[migrate] 收藏迁移失败", logger.Err(err))
			}
			logger.Info("[migrate] 收藏→候选迁移完成", zap.Int("migrated", m), zap.Int("skipped", sk))
			return
		}
		// 一次性:回填存量空/过期签名封面,永久化到 COS 后退出。
		if arg == "--backfill-covers" {
			up, sk, err := discSvc.BackfillCovers(context.Background())
			if err != nil {
				logger.Fatal("[backfill] 封面回填失败", logger.Err(err))
			}
			logger.Info("[backfill] 封面回填完成", zap.Int("updated", up), zap.Int("skipped", sk))
			return
		}
		// 一次性:遍历所有站点 × 所有一级类目,把每组合前 5 页商品落库(1 req/s,断点续跑)。
		// 用法:docker compose run --rm go-api ./server --backfill-products
		if arg == "--backfill-products" {
			ft, sk, err := discSvc.BackfillDiscover(context.Background(), service.BackfillKindsProductOnly)
			if err != nil {
				logger.Fatal("[backfill] 商品全量回填失败", logger.Err(err))
			}
			logger.Info("[backfill] 商品全量回填完成", zap.Int("fetched", ft), zap.Int("skippedCombos", sk))
			return
		}
		// 一次性:遍历所有站点 × 类目 × 三类实体(店铺/达人/视频),把每组合前 N 页落库(1 req/s,断点续跑)。
		// 用法:docker compose run --rm go-api ./server --backfill-entities
		if arg == "--backfill-entities" {
			ft, sk, err := discSvc.BackfillAllEntities(context.Background())
			if err != nil {
				logger.Fatal("[backfill] 实体全量回填失败", logger.Err(err))
			}
			logger.Info("[backfill] 实体全量回填完成", zap.Int("fetched", ft), zap.Int("skippedCombos", sk))
			return
		}
		// 一次性:回填存量空译文(商品标题 name_zh + 视频文案 desc_zh),批量调 LLM 后退出。
		// 用法:docker compose run --rm go-api ./server --backfill-translations
		if arg == "--backfill-translations" {
			queued, err := discSvc.BackfillTranslations(context.Background())
			if err != nil {
				logger.Fatal("[backfill] 翻译回填失败", logger.Err(err))
			}
			logger.Info("[backfill] 翻译回填完成", zap.Int("queued", queued))
			return
		}
	}

	agentSvc := service.NewAgentService(db, llmClient, videoSvc, discSvc, store, quotaSvc)
	tplSvc := service.NewTemplateService(db, llmClient)

	// 重启恢复:续上生成中视频的轮询,清掉随进程消失的悬挂任务(额度退回)。
	go func() {
		rctx, rcancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer rcancel()
		agentSvc.BackfillConversations(rctx) // 存量任务回填会话归属(幂等,一任务一会话)
		agentSvc.RecoverStartup(rctx)
		videoSvc.RecoverStartup(rctx)
	}()
	if llmClient.Configured() {
		logger.Info("[llm] OpenRouter 已配置", logger.String("model", llmClient.Model()))
	} else {
		logger.Warn("[llm] OPENROUTER_API_KEY 未配置,Agent 走未配置降级")
	}
	if store.Configured() {
		logger.Info("[storage] 腾讯云 COS 已配置")
	} else {
		logger.Warn("[storage] COS 未配置,素材上传不可用")
	}

	if echoClient.Configured() {
		logger.Info("[echotik] 已配置凭证,走实时数据")
	} else {
		logger.Warn("[echotik] 未配置 ECHOTIK_USERNAME/PASSWORD,发现页返回空态")
	}

	// 后台任务:选品榜单定时同步(预热缓存 + 每日快照)+ TEAM 超额月度结算出账。
	jobCtx, jobCancel := context.WithCancel(context.Background())
	defer jobCancel()
	job.NewDiscoverSync(cfg.DiscoverSync, discSvc, echoClient).Start(jobCtx)
	job.NewOverflowSettle(cfg.OverflowSettle, billingSvc).Start(jobCtx)
	discSvc.StartCoverRehost(jobCtx)
	discSvc.StartTranslate(jobCtx)
	discSvc.StartVideoPipeline(jobCtx, cfg.VideoPipeline)

	r := router.New(router.Deps{
		Cfg:       cfg,
		Auth:      authSvc,
		Workspace: wsSvc,
		Product:   prodSvc,
		Discover:  discSvc,
		Marketing: mktSvc,
		Shop:      shopSvc,
		Model:     modelSvc,
		Material:  matSvc,
		Agent:     agentSvc,
		Video:     videoSvc,
		Template:  tplSvc,
		Billing:   billingSvc,
		Quota:     quotaSvc,
		Agency:    agencySvc,
		Admin:     adminSvc,
		Feedback:  feedbackSvc,
		// 就绪探针:DB ping(带 2s 超时)。让 /ready 在 DB 不可达时返回 503,
		// 而非像过去那样空探针恒 200(伪健康)。
		Ready: []func() error{
			func() error {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				return sqlDB.PingContext(ctx)
			},
		},
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("faxianmao-server 启动",
			zap.String("addr", srv.Addr),
			zap.String("mode", cfg.Server.Mode),
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTP 服务退出", logger.Err(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("收到停机信号,30s 内优雅退出")
	jobCancel()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Shutdown 失败", logger.Err(err))
	}
	logger.Info("再见 ✦")
}
