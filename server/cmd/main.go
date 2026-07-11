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

	// EntityRanklistEntry 增加 page_num 维度:旧 6 列唯一索引 uq_ere_key 需先删,
	// AutoMigrate 才会按新列集重建为 uq_ere_pg(GORM 不会改既有同名索引的列)。幂等:删后即 no-op。
	db.Exec("DROP INDEX IF EXISTS uq_ere_key")

	// DiscoverBackfillCursor 增加 kind 维度:旧 3 列唯一索引(provider,region,category_id)与
	// saveBackfillCursor 的 ON CONFLICT 4 列不匹配(42P10 → 游标 upsert 全失败、断点续跑失效)。
	// 仅当索引还是旧列集(缺 kind)时删除,AutoMigrate 按模型标签重建 4 列版;新环境/已修复则 no-op。
	db.Exec(`DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_dbc_key' AND indexdef NOT LIKE '%kind%') THEN
			EXECUTE 'DROP INDEX uq_dbc_key';
		END IF;
	END $$`)

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
		&model.CommissionRecord{},
		&model.AgencyWithdrawal{},
		&model.BonusCreditGrant{},
	); err != nil {
		logger.Fatal("表结构迁移失败", logger.Err(err))
	}

	// Services
	agencySvc := service.NewAgencyService(db, cfg.Agency)
	smsSvc := service.NewSMSService(db, &cfg.SMS, cfg.IsDev())
	authSvc := service.NewAuthService(db, cfg, smsSvc, agencySvc)
	wsSvc := service.NewWorkspaceService(db)
	prodSvc := service.NewProductService(db)
	echoClient := echotik.New(cfg.EchoTik)
	store := storage.New(cfg.Storage)
	llmClient := llm.New(cfg.OpenRouter)
	discSvc := service.NewDiscoverService(db, echoClient, store, llmClient)
	mktSvc := service.NewMarketingService(db)
	shopSvc := service.NewShopService(db)
	modelSvc := service.NewModelAssetService(db)
	falClient := fal.New(cfg.Fal)
	quotaSvc := service.NewQuotaService(db)
	matSvc := service.NewMaterialService(db, store, falClient, quotaSvc)
	billingSvc := service.NewBillingService(db, cfg.IsDev(), agencySvc, cfg.Agency.CommissionOnMock)
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
		// 一次性:回填存量空/过期签名封面,永久化到 COS 后退出。
		if arg == "--backfill-covers" {
			up, sk, err := discSvc.BackfillCovers(context.Background())
			if err != nil {
				logger.Fatal("[backfill] 封面回填失败", logger.Err(err))
			}
			logger.Info("[backfill] 封面回填完成", zap.Int("updated", up), zap.Int("skipped", sk))
			return
		}
		// 一次性:把存量未翻译的商品标题/视频文案批量译成中文回填后退出(幂等,已译跳过)。
		// 用法:docker compose run --rm go-api ./server --backfill-translations
		if arg == "--backfill-translations" {
			q, err := discSvc.BackfillTranslations(context.Background())
			if err != nil {
				logger.Fatal("[backfill] 翻译回填失败", logger.Err(err))
			}
			logger.Info("[backfill] 翻译回填完成", zap.Int("queued", q))
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
		// 一次性:清理库里遗留的 mock 占位数据(历史上 EchoTik 短暂不可用时错误兜底落进过库)。幂等。
		// 用法:docker compose run --rm go-api ./server --purge-mock
		if arg == "--purge-mock" {
			rep, err := discSvc.PurgeMockData(context.Background())
			if err != nil {
				logger.Fatal("[purge-mock] 清理 mock 数据失败", logger.Err(err))
			}
			logger.Info("[purge-mock] 清理 mock 数据完成",
				zap.Int64("products", rep.Products),
				zap.Int64("importedCandidates", rep.ImportedCandidates),
				zap.Int64("sellers", rep.Sellers),
				zap.Int64("influencers", rep.Influencers),
				zap.Int64("videos", rep.Videos),
				zap.Int64("ranklistEntriesFixed", rep.RanklistEntriesFixed),
			)
			return
		}
		// 一次性:整个选品板块四榜(商品/店铺/达人/视频)全量本地化。同样 1 req/s、断点续跑。
		// 用法:docker compose run --rm go-api ./server --backfill-discover
		if arg == "--backfill-discover" {
			ft, sk, err := discSvc.BackfillDiscover(context.Background(), service.BackfillKindsAll)
			if err != nil {
				logger.Fatal("[backfill] 选品板块全量回填失败", logger.Err(err))
			}
			logger.Info("[backfill] 选品板块全量回填完成", zap.Int("fetched", ft), zap.Int("skippedCombos", sk))
			return
		}
	}

	agentSvc := service.NewAgentService(db, llmClient, videoSvc, discSvc, falClient, store, quotaSvc)
	tplSvc := service.NewTemplateService(db, llmClient)

	// 自愈:每次启动清掉任何遗留的 mock 占位数据(历史错误兜底落库的存量)。
	// 使生产永不带 mock,无需人工命令;幂等,清完即 no-op;失败只告警不阻断启动。
	go func() {
		pctx, pcancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer pcancel()
		if _, err := discSvc.PurgeMockData(pctx); err != nil {
			logger.Warn("[purge-mock] 启动自愈清理失败", logger.Err(err))
		}
	}()

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
		logger.Warn("[echotik] 未配置 ECHOTIK_USERNAME/PASSWORD,发现页走 mock 数据")
	}

	// 后台任务:选品榜单定时同步(预热缓存 + 每日快照)+ TEAM 超额月度结算出账。
	jobCtx, jobCancel := context.WithCancel(context.Background())
	defer jobCancel()
	job.NewDiscoverSync(cfg.DiscoverSync, discSvc, echoClient).Start(jobCtx)
	job.NewOverflowSettle(cfg.OverflowSettle, billingSvc).Start(jobCtx)
	discSvc.StartCoverRehost(jobCtx)                      // 封面转存后台 worker(读路径投递、异步存 COS)
	discSvc.StartTranslate(jobCtx)                        // 外文字段翻译后台 worker(落库投递、异步译中文回填)
	discSvc.StartVideoPipeline(jobCtx, cfg.VideoPipeline) // 爆款视频下载转存 COS + AI 拆解(sale_cnt>阈值,后台预计算)

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
