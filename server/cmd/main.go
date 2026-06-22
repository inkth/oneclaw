// oneclaw-server 入口。
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

	"github.com/oneclaw/server/internal/config"
	"github.com/oneclaw/server/internal/job"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/router"
	"github.com/oneclaw/server/internal/service"
	"github.com/oneclaw/server/internal/service/echotik"
	"github.com/oneclaw/server/internal/service/fal"
	"github.com/oneclaw/server/internal/service/llm"
	"github.com/oneclaw/server/internal/storage"
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

	if err := db.AutoMigrate(
		&model.User{},
		&model.PhoneVerificationCode{},
		&model.Workspace{},
		&model.Membership{},
		&model.Product{},
		&model.DiscoverProduct{},
		&model.RanklistCacheEntry{},
		&model.DiscoverSnapshot{},
		&model.DiscoverInfluencer{},
		&model.DiscoverInfluencerSnapshot{},
		&model.DiscoverSeller{},
		&model.DiscoverSellerSnapshot{},
		&model.DiscoverVideo{},
		&model.DiscoverVideoSnapshot{},
		&model.DiscoverCache{},
		&model.CoverAsset{},
		&model.WorkspaceDiscoverInteraction{},
		&model.WorkspaceDiscoverFavorite{},
		&model.NewsletterSubscription{},
		&model.DemoRequest{},
		&model.Shop{},
		&model.ModelAsset{},
		&model.Material{},
		&model.AgentTask{},
		&model.Video{},
		&model.CreationTemplate{},
		&model.UsageRecord{},
		&model.PaymentOrder{},
		&model.OverflowBill{},
	); err != nil {
		logger.Fatal("表结构迁移失败", logger.Err(err))
	}

	// Services
	smsSvc := service.NewSMSService(db, &cfg.SMS, cfg.IsDev())
	authSvc := service.NewAuthService(db, cfg, smsSvc)
	wsSvc := service.NewWorkspaceService(db)
	prodSvc := service.NewProductService(db)
	echoClient := echotik.New(cfg.EchoTik)
	store := storage.New(cfg.Storage)
	discSvc := service.NewDiscoverService(db, echoClient, store)
	mktSvc := service.NewMarketingService(db)
	shopSvc := service.NewShopService(db)
	modelSvc := service.NewModelAssetService(db)
	llmClient := llm.New(cfg.OpenRouter)
	falClient := fal.New(cfg.Fal)
	quotaSvc := service.NewQuotaService(db)
	matSvc := service.NewMaterialService(db, store, falClient, quotaSvc)
	billingSvc := service.NewBillingService(db, cfg.IsDev())
	videoSvc := service.NewVideoService(db, llmClient, store, falClient, quotaSvc)
	if falClient.Configured() {
		logger.Info("[fal] 已配置(封面图)")
	} else {
		logger.Warn("[fal] FALAI_API_KEY 未配置,封面图不可用")
	}
	// 一次性任务:生成预置人设库(Seedream 出图 → COS → model_assets)后退出。
	// 用法:docker compose run --rm go-api ./server --seed-personas
	for _, arg := range os.Args[1:] {
		if arg == "--seed-personas" {
			created, err := service.NewPersonaSeeder(db, falClient, store).Run(context.Background())
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
	}

	agentSvc := service.NewAgentService(db, llmClient, videoSvc, discSvc, falClient, store, quotaSvc)
	tplSvc := service.NewTemplateService(db, llmClient)

	// 重启恢复:续上生成中视频的轮询,清掉随进程消失的悬挂任务(额度退回)。
	go func() {
		rctx, rcancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer rcancel()
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
		logger.Warn("[echotik] 未配置 ECHOTIK_USERNAME/PASSWORD,发现页走 mock 数据")
	}

	// 后台任务:选品榜单定时同步(预热缓存 + 每日快照)+ TEAM 超额月度结算出账。
	jobCtx, jobCancel := context.WithCancel(context.Background())
	defer jobCancel()
	job.NewDiscoverSync(cfg.DiscoverSync, discSvc, echoClient).Start(jobCtx)
	job.NewOverflowSettle(cfg.OverflowSettle, billingSvc).Start(jobCtx)

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
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("oneclaw-server 启动",
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
