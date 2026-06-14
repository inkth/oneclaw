// Package router 集中路由表与中间件挂载。
package router

import (
	"github.com/gin-gonic/gin"

	"github.com/oneclaw/server/internal/config"
	"github.com/oneclaw/server/internal/handler"
	"github.com/oneclaw/server/internal/middleware"
	"github.com/oneclaw/server/internal/service"
)

type Deps struct {
	Cfg       *config.Config
	Auth      *service.AuthService
	Workspace *service.WorkspaceService
	Product   *service.ProductService
	Discover  *service.DiscoverService
	Marketing *service.MarketingService
	Shop      *service.ShopService
	Model     *service.ModelAssetService
	Material  *service.MaterialService
	Agent     *service.AgentService
	Video     *service.VideoService
	Template  *service.TemplateService
	Billing   *service.BillingService
	Quota     *service.QuotaService
}

func New(d Deps) *gin.Engine {
	if d.Cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()

	r.Use(
		middleware.Recovery(),
		middleware.RequestID(),
		middleware.Trace(),
		middleware.Logging(),
		middleware.CORS(d.Cfg.CORS.Origins),
		middleware.ErrorHandler(),
	)

	authH := handler.NewAuthHandler(d.Auth, d.Workspace, d.Cfg.Cookie)
	wsH := handler.NewWorkspaceHandler(d.Workspace)
	prodH := handler.NewProductHandler(d.Product, d.Workspace)
	discH := handler.NewDiscoverHandler(d.Discover, d.Workspace, d.Agent)
	mktH := handler.NewMarketingHandler(d.Marketing)
	shopH := handler.NewShopHandler(d.Shop, d.Workspace)
	modelH := handler.NewModelHandler(d.Model, d.Workspace)
	matH := handler.NewMaterialHandler(d.Material, d.Workspace)
	agentH := handler.NewAgentHandler(d.Agent, d.Workspace)
	videoH := handler.NewVideoHandler(d.Video, d.Workspace)
	tplH := handler.NewTemplateHandler(d.Template, d.Workspace)
	reviewH := handler.NewReviewHandler(d.Workspace, d.Agent)
	billH := handler.NewBillingHandler(d.Billing, d.Quota, d.Workspace)

	r.GET("/health", handler.Health)
	r.GET("/ready", handler.Ready())

	api := r.Group("/api/v1")
	api.Use(middleware.RateLimit(&d.Cfg.RateLimit))

	// 公共
	auth := api.Group("/auth")
	{
		auth.POST("/send-code", authH.SendCode)
		auth.POST("/login", authH.Login)
		auth.POST("/logout", authH.Logout)
	}

	// 公共:落地页表单
	api.POST("/subscribe", mktH.Subscribe)
	api.POST("/demo", mktH.Demo)

	// 公共:游客可逛的爆品榜 + 商品详情(无个性化浮层)
	api.GET("/discover/ranklist", discH.RanklistPublic)
	api.GET("/discover/products/:externalId", discH.Detail)

	// 公共:店铺 / 达人 / 带货视频榜(只读,无个性化)+ 一级类目筛选项
	api.GET("/discover/seller-ranklist", discH.SellerRanklist)
	api.GET("/discover/influencer-ranklist", discH.InfluencerRanklist)
	api.GET("/discover/video-ranklist", discH.VideoRanklist)
	api.GET("/discover/categories", discH.Categories)
	api.GET("/discover/sellers/:sellerId", discH.SellerDetail)
	api.GET("/discover/influencers/:userId", discH.InfluencerDetail)
	api.GET("/discover/videos/:videoId", discH.VideoDetail)

	// 需登录
	priv := api.Group("")
	priv.Use(middleware.Auth(d.Auth, d.Cfg.Cookie.Name))
	{
		priv.GET("/me", authH.Me)
		priv.GET("/workspaces/default", wsH.GetDefault)

		priv.GET("/workspaces/:wid/products", prodH.List)
		priv.GET("/workspaces/:wid/products/:pid/publish-kit", prodH.PublishKit)
		priv.POST("/workspaces/:wid/products", prodH.Create)
		priv.PATCH("/workspaces/:wid/products/:pid", prodH.Update)
		priv.DELETE("/workspaces/:wid/products/:pid", prodH.Delete)

		priv.GET("/workspaces/:wid/discover/ranklist", discH.Ranklist)
		priv.GET("/workspaces/:wid/discover/products/:externalId", discH.DetailFull)
		priv.POST("/workspaces/:wid/discover/interactions", discH.Interaction)
		priv.POST("/workspaces/:wid/discover/import-product", discH.Import)
		priv.POST("/workspaces/:wid/discover/analyze", discH.Analyze)
		priv.GET("/workspaces/:wid/discover/favorites", discH.Favorites)
		priv.POST("/workspaces/:wid/discover/favorites", discH.Favorite)
		priv.GET("/workspaces/:wid/discover/favorites/check", discH.FavoriteCheck)

		priv.POST("/workspaces/:wid/review/analyze", reviewH.Analyze)

		priv.GET("/workspaces/:wid/shops", shopH.List)
		priv.POST("/workspaces/:wid/shops", shopH.Create)
		priv.PATCH("/workspaces/:wid/shops/:sid", shopH.Update)
		priv.DELETE("/workspaces/:wid/shops/:sid", shopH.Delete)

		priv.GET("/workspaces/:wid/models", modelH.List)
		priv.POST("/workspaces/:wid/models", modelH.Create)
		priv.PATCH("/workspaces/:wid/models/:mid", modelH.Update)
		priv.DELETE("/workspaces/:wid/models/:mid", modelH.Delete)

		priv.GET("/workspaces/:wid/materials", matH.List)
		priv.POST("/workspaces/:wid/materials", matH.Upload)
		priv.DELETE("/workspaces/:wid/materials/:mid", matH.Delete)

		priv.GET("/workspaces/:wid/agent-tasks", agentH.List)
		priv.POST("/workspaces/:wid/agent-tasks", agentH.Create)
		priv.GET("/workspaces/:wid/agent-tasks/:tid", agentH.Get)
		priv.POST("/workspaces/:wid/agent-tasks/:tid/video", agentH.ConfirmVideo)
		priv.POST("/workspaces/:wid/agent-tasks/:tid/redraft", agentH.RedraftVideo)
		priv.POST("/workspaces/:wid/agent-tasks/:tid/rewrite", agentH.RewriteVideo)
		priv.POST("/workspaces/:wid/agent-tasks/:tid/images", agentH.GenerateImages)

		priv.GET("/workspaces/:wid/videos", videoH.List)
		priv.GET("/workspaces/:wid/videos/:vid", videoH.Detail)
		priv.POST("/workspaces/:wid/videos", videoH.Create)
		priv.POST("/workspaces/:wid/videos/:vid/refresh", videoH.Refresh)
		priv.POST("/workspaces/:wid/videos/:vid/retry", videoH.Retry)
		priv.POST("/workspaces/:wid/videos/:vid/rerender", videoH.Rerender)
		priv.DELETE("/workspaces/:wid/videos/:vid", videoH.Delete)

		priv.GET("/workspaces/:wid/usage", billH.Usage)
		priv.POST("/workspaces/:wid/billing/checkout", billH.Checkout)
		priv.GET("/workspaces/:wid/billing/orders/:oid", billH.GetOrder)
		priv.POST("/workspaces/:wid/billing/orders/:oid/mock-confirm", billH.MockConfirm)

		priv.GET("/workspaces/:wid/templates", tplH.List)
		priv.POST("/workspaces/:wid/templates", tplH.Create)
		priv.POST("/workspaces/:wid/templates/optimize", tplH.Optimize)
		priv.PATCH("/workspaces/:wid/templates/:tid", tplH.Update)
		priv.DELETE("/workspaces/:wid/templates/:tid", tplH.Delete)
	}

	return r
}
