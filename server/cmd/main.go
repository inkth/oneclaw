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
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/router"
	"github.com/oneclaw/server/internal/service"
	"github.com/oneclaw/server/internal/service/echotik"
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
		&model.WorkspaceDiscoverInteraction{},
		&model.NewsletterSubscription{},
		&model.DemoRequest{},
		&model.Shop{},
		&model.ModelAsset{},
	); err != nil {
		logger.Fatal("表结构迁移失败", logger.Err(err))
	}

	// Services
	smsSvc := service.NewSMSService(db, &cfg.SMS, cfg.IsDev())
	authSvc := service.NewAuthService(db, cfg, smsSvc)
	wsSvc := service.NewWorkspaceService(db)
	prodSvc := service.NewProductService(db)
	echoClient := echotik.New(cfg.EchoTik)
	discSvc := service.NewDiscoverService(db, echoClient)
	mktSvc := service.NewMarketingService(db)
	shopSvc := service.NewShopService(db)
	modelSvc := service.NewModelAssetService(db)

	if echoClient.Configured() {
		logger.Info("[echotik] 已配置凭证,走实时数据")
	} else {
		logger.Warn("[echotik] 未配置 ECHOTIK_USERNAME/PASSWORD,发现页走 mock 数据")
	}

	r := router.New(router.Deps{
		Cfg:       cfg,
		Auth:      authSvc,
		Workspace: wsSvc,
		Product:   prodSvc,
		Discover:  discSvc,
		Marketing: mktSvc,
		Shop:      shopSvc,
		Model:     modelSvc,
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

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Shutdown 失败", logger.Err(err))
	}
	logger.Info("再见 ✦")
}
