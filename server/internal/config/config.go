// Package config 加载并校验 faxianmao-server 的运行时配置。
//
// 优先级:.env 文件 → 进程环境变量 → 代码内默认值。
// Phase 1 不依赖 Redis(限流走内存、验证码落 Postgres),配置已相应精简。
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server         ServerConfig
	Database       DatabaseConfig
	JWT            JWTConfig
	Cookie         CookieConfig
	RateLimit      RateLimitConfig
	SMS            SMSConfig
	EchoTik        EchoTikConfig
	DiscoverSync   DiscoverSyncConfig
	VideoPipeline  DiscoverVideoPipelineConfig
	OverflowSettle OverflowSettleConfig
	Storage        StorageConfig
	OpenRouter     OpenRouterConfig
	Agency         AgencyConfig
	CORS           CORSConfig
	Log            LogConfig
}

// AgencyConfig 代理商系统。BonusCredits 经邀请码注册的新人一次性赠送积分;
// DefaultCommissionBP 新开通代理商的默认佣金比例(万分比,2000=20%);
// CommissionOnMock 仅 dev 生效:是否让 mock 支付也计佣(联调计佣链路用,默认 false 保持「mock 不计佣」)。
type AgencyConfig struct {
	BonusCredits        int
	DefaultCommissionBP int
	CommissionOnMock    bool
}

type ServerConfig struct {
	Port        string
	Mode        string   // debug | release
	AdminPhones []string // 命中即自动 role=admin
}

type DatabaseConfig struct {
	Host         string
	Port         string
	User         string
	Password     string
	DBName       string
	SSLMode      string
	MaxOpenConns int
	MaxIdleConns int
}

func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=Asia/Shanghai",
		d.Host, d.Port, d.User, d.Password, d.DBName, d.SSLMode,
	)
}

type JWTConfig struct {
	Secret     string
	ExpireHour int
}

func (j JWTConfig) AccessTTL() time.Duration { return time.Duration(j.ExpireHour) * time.Hour }

// CookieConfig 控制 oc_session 会话 Cookie。Next 与 Go 同域(nginx),用首方 httpOnly Cookie。
type CookieConfig struct {
	Name   string
	Domain string // 生产为公网域名;本地留空(host-only)
	Secure bool   // 生产 true(HTTPS)
}

type RateLimitConfig struct {
	Enabled        bool
	RequestsPerMin int
}

type SMSConfig struct {
	Provider          string // mock | tencent
	TencentSecretID   string
	TencentSecretKey  string
	TencentSDKAppID   string
	TencentSignName   string
	TencentTemplateID string
	TencentRegion     string // 如 ap-guangzhou
}

func (s SMSConfig) TencentConfigured() bool {
	return s.TencentSecretID != "" && s.TencentSecretKey != "" && s.TencentSDKAppID != "" &&
		s.TencentSignName != "" && s.TencentTemplateID != ""
}

// EchoTikConfig EchoTik 开放 API(TikTok Shop 选品数据源)。HTTP Basic Auth。
type EchoTikConfig struct {
	BaseURL  string
	Username string
	Password string
}

func (e EchoTikConfig) Configured() bool { return e.Username != "" && e.Password != "" }

// DiscoverSyncConfig 选品榜单定时同步:预热榜单缓存 + 保证每日快照连续。
// 仅在 EchoTik 已配置时生效。
type DiscoverSyncConfig struct {
	Enabled       bool
	Interval      time.Duration // 与榜单缓存 TTL(6h)对齐
	Combos        []SyncCombo   // 抓取的 region × 榜单组合
	PageSize      int           // 每榜抓取条数
	Pages         int           // 每组合预热的页数(累积到顺序表,供本地翻页)
	CategorySweep bool          // 每日一轮 combo 站点 × 全一级类目 × 四榜第 1 页(类目首屏保鲜)
	EnrichMinSale int           // 入库销量门槛:后台同步中累计销量低于此值的商品整条不入库(0=不设限)
}

// SyncCombo 一组榜单抓取参数。RankType/RankField 取值见 echotik 包枚举(1=热销榜/销量)。
type SyncCombo struct {
	Region    string
	RankType  int
	RankField int
}

// DiscoverVideoPipelineConfig 爆款视频永久化 + AI 拆解后台管线。
// 对某站点 sale_cnt>阈值 的热门带货视频:下载无水印 mp4 转存 COS + 复用多模态管线做 AI 拆解,
// 全后台预计算。需 EchoTik + COS + LLM 三者都配置才启动(缺一即跳过)。
type DiscoverVideoPipelineConfig struct {
	Enabled       bool
	Interval      time.Duration
	Region        string // 只处理该站点(先只跑美国站)
	SaleThreshold int    // 带货销量门槛,超过才处理
	PerRun        int    // 每轮每支路认领上限(成本闸门:直接封顶 EchoTik 实时调用 + 多模态调用数)
	Concurrency   int    // 并发处理数(多模态解析 + ffmpeg 均重,宜小)
	MaxAttempts   int    // 单条失败退避上限
}

// OverflowSettleConfig TEAM 超额月度结算 job:把上一账期 billable 用量出账(幂等)。
// Interval 为轮询频率,出账幂等故粗粒度即可(默认 6h,跨月后首个 tick 自然结清上月)。
type OverflowSettleConfig struct {
	Enabled  bool
	Interval time.Duration
}

// StorageConfig 腾讯云 COS 对象存储(素材 / 视频转存)。
type StorageConfig struct {
	COSBucket    string // TENCENT_COS_BUCKET
	COSRegion    string // TENCENT_COS_REGION
	COSSecretID  string // TENCENT_SECRET_ID
	COSSecretKey string // TENCENT_SECRET_KEY
	COSDomain    string // TENCENT_COS_DOMAIN(可选 CDN 域名)
}

func (s StorageConfig) Configured() bool {
	return s.COSBucket != "" && s.COSRegion != "" && s.COSSecretID != "" && s.COSSecretKey != ""
}

// OpenRouterConfig LLM 网关(Agent 用)。未配置 key 时 Agent 走 mock。
type OpenRouterConfig struct {
	APIKey         string
	Model          string // 文本默认 deepseek/deepseek-v4-pro(直连可达;推理轻量,现有 800+ 预算即可出全文)
	TranslateModel string // 选品外文字段翻译默认 deepseek/deepseek-v4-flash(快且便宜)
	// ReviewModel 复盘深挖 + 看图(Listing/判品类)。须选国内直连可达的多模态模型:
	// Google 全系在国内 IP 一律 403(地区限制),且经正向代理绕行会被 OpenRouter 判
	// 「违反供应商服务条款」直接封禁 —— 2026-07-17 实测两条路都不通,故已弃用 gemini。
	// minimax-m3 直连可用、支持看图、且不带推理(不会烧光 max_tokens 返回空正文)。
	ReviewModel string
	// AudioModel 视频解析第一段「听音频转录」专用。ReviewModel(minimax)不吃 input_audio
	// (会 404 No endpoints found that support input audio),故转录另用支持音频的模型。
	// voxtral-small-24b 国内直连可达、实测 ~20s 出准确逐句转录+翻译;第二段拆解仍走 ReviewModel。
	AudioModel string
	VideoModel string // 视频默认 bytedance/seedance-2.0-fast
	// ImageModel 图像默认 bytedance-seed/seedream-4.5:字节自家 provider,国内直连可达
	// (不像 Google/OpenAI 系对国内 IP 屏蔽),支持参考图编辑/多图合成/虚拟试穿,直接返回 JPEG。
	ImageModel string
	Referer    string // HTTP-Referer 头
}

// 注:全站已无出网代理 —— 经代理调 OpenRouter 会被判 ToS 违规封禁;出图改用 seedream(字节自家
// provider,国内直连)后,原先唯一在用代理的 fal 结果图下载也随 fal 一并退役。

func (o OpenRouterConfig) Configured() bool { return o.APIKey != "" }

// CORSConfig 带凭证跨域:本地开发 Next(:3000)调 Go(:8082)需显式白名单(不能用 *)。
type CORSConfig struct {
	Origins []string
}

type LogConfig struct {
	Level  string
	Output string
}

func Load() *Config {
	_ = godotenv.Load() // 缺失 .env 不致命

	return &Config{
		Server: ServerConfig{
			Port:        getEnv("SERVER_PORT", "8080"),
			Mode:        getEnv("GIN_MODE", "debug"),
			AdminPhones: splitCSV(getEnv("ADMIN_PHONES", "")),
		},
		Database: DatabaseConfig{
			Host:         getEnv("DB_HOST", "localhost"),
			Port:         getEnv("DB_PORT", "5432"),
			User:         getEnv("DB_USER", "postgres"),
			Password:     getEnv("DB_PASSWORD", "postgres"),
			DBName:       getEnv("DB_NAME", "faxianmao"),
			SSLMode:      getEnv("DB_SSLMODE", "disable"),
			MaxOpenConns: getEnvInt("DB_MAX_OPEN_CONNS", 20),
			MaxIdleConns: getEnvInt("DB_MAX_IDLE_CONNS", 5),
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", "change-me"),
			ExpireHour: getEnvInt("JWT_EXPIRE_HOUR", 720), // 30d(网页会话)
		},
		Cookie: CookieConfig{
			Name:   getEnv("COOKIE_NAME", "oc_session"),
			Domain: getEnv("COOKIE_DOMAIN", ""),
			Secure: getEnvBool("COOKIE_SECURE", false),
		},
		RateLimit: RateLimitConfig{
			Enabled:        getEnvBool("RATE_LIMIT_ENABLED", true),
			RequestsPerMin: getEnvInt("RATE_LIMIT_REQUESTS_PER_MIN", 120),
		},
		SMS: SMSConfig{
			Provider:          getEnv("SMS_PROVIDER", "mock"),
			TencentSecretID:   getEnv("SMS_TENCENT_SECRET_ID", ""),
			TencentSecretKey:  getEnv("SMS_TENCENT_SECRET_KEY", ""),
			TencentSDKAppID:   getEnv("SMS_TENCENT_SDK_APP_ID", ""),
			TencentSignName:   getEnv("SMS_TENCENT_SIGN_NAME", ""),
			TencentTemplateID: getEnv("SMS_TENCENT_TEMPLATE_ID", ""),
			TencentRegion:     getEnv("SMS_TENCENT_REGION", "ap-guangzhou"),
		},
		EchoTik: EchoTikConfig{
			BaseURL:  getEnv("ECHOTIK_BASE_URL", "https://open.echotik.live/api/v3"),
			Username: getEnv("ECHOTIK_USERNAME", ""),
			Password: getEnv("ECHOTIK_PASSWORD", ""),
		},
		DiscoverSync: DiscoverSyncConfig{
			Enabled:  getEnvBool("DISCOVER_SYNC_ENABLED", true),
			Interval: time.Duration(getEnvInt("DISCOVER_SYNC_INTERVAL_HOURS", 6)) * time.Hour,
			Combos:   parseSyncCombos(getEnv("DISCOVER_SYNC_COMBOS", "US,ID,TH,VN")),
			// 预热前 maxDiscoverPage(10)页商品榜:10 页 × 前端 page_size 16 = 160,
			// 让「全部」类目前 10 页全命中缓存零 EchoTik。改小会让深页回退实时拉。
			PageSize: getEnvInt("DISCOVER_SYNC_PAGE_SIZE", 160),
			Pages:    getEnvInt("DISCOVER_SYNC_PAGES", 3),
			// 每日类目扫:combo 站点 × 全一级类目 × 四榜第 1 页,约 500 请求/天。
			CategorySweep: getEnvBool("DISCOVER_SYNC_CATEGORY_SWEEP", true),
			// 低于门槛的商品整条不入库(产品拍板:榜单只收有销量验证的商品)。
			EnrichMinSale: getEnvInt("DISCOVER_ENRICH_MIN_SALE", 100),
		},
		VideoPipeline: DiscoverVideoPipelineConfig{
			Enabled:       getEnvBool("VIDEO_PIPELINE_ENABLED", true),
			Interval:      time.Duration(getEnvInt("VIDEO_PIPELINE_INTERVAL_MINUTES", 10)) * time.Minute,
			Region:        getEnv("VIDEO_PIPELINE_REGION", "US"),
			SaleThreshold: getEnvInt("VIDEO_PIPELINE_SALE_THRESHOLD", 500),
			PerRun:        getEnvInt("VIDEO_PIPELINE_PER_RUN", 20),
			Concurrency:   getEnvInt("VIDEO_PIPELINE_CONCURRENCY", 2),
			MaxAttempts:   getEnvInt("VIDEO_PIPELINE_MAX_ATTEMPTS", 3),
		},
		OverflowSettle: OverflowSettleConfig{
			Enabled:  getEnvBool("OVERFLOW_SETTLE_ENABLED", true),
			Interval: time.Duration(getEnvInt("OVERFLOW_SETTLE_INTERVAL_HOURS", 6)) * time.Hour,
		},
		Storage: StorageConfig{
			COSBucket:    getEnv("TENCENT_COS_BUCKET", ""),
			COSRegion:    getEnv("TENCENT_COS_REGION", ""),
			COSSecretID:  getEnv("TENCENT_SECRET_ID", ""),
			COSSecretKey: getEnv("TENCENT_SECRET_KEY", ""),
			COSDomain:    getEnv("TENCENT_COS_DOMAIN", ""),
		},
		OpenRouter: OpenRouterConfig{
			APIKey:         getEnv("OPENROUTER_API_KEY", ""),
			Model:          getEnv("OPENROUTER_MODEL", "deepseek/deepseek-v4-pro"),
			TranslateModel: getEnv("OPENROUTER_TRANSLATE_MODEL", "deepseek/deepseek-v4-flash"),
			ReviewModel:    getEnv("OPENROUTER_REVIEW_MODEL", "minimax/minimax-m3"),
			AudioModel:     getEnv("OPENROUTER_AUDIO_MODEL", "mistralai/voxtral-small-24b-2507"),
			VideoModel:     getEnv("OPENROUTER_VIDEO_MODEL", "bytedance/seedance-2.0-fast"),
			ImageModel:     getEnv("OPENROUTER_IMAGE_MODEL", "bytedance-seed/seedream-4.5"),
			Referer:        getEnv("OPENROUTER_REFERER", "https://faxianmao.com"),
		},
		Agency: AgencyConfig{
			BonusCredits:        getEnvInt("AGENCY_BONUS_CREDITS", 300),
			DefaultCommissionBP: getEnvInt("AGENCY_DEFAULT_COMMISSION_BP", 2000),
			CommissionOnMock:    getEnvBool("AGENCY_COMMISSION_ON_MOCK", false),
		},
		CORS: CORSConfig{
			Origins: splitCSV(getEnv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")),
		},
		Log: LogConfig{
			Level:  getEnv("LOG_LEVEL", "info"),
			Output: getEnv("LOG_OUTPUT", "stdout"),
		},
	}
}

// Validate 检查必填项。生产模式下要求安全配置不可为默认值。
func (c *Config) Validate() error {
	if c.JWT.Secret == "" || c.JWT.Secret == "change-me" {
		if c.Server.Mode == "release" {
			return fmt.Errorf("JWT_SECRET 必须在生产环境中设置为非默认值")
		}
	}
	// 生产禁用默认弱口令(脱离 compose 的 ${VAR:?} 兜底直跑二进制时的最后防线)。
	if c.Server.Mode == "release" && (c.Database.Password == "" || c.Database.Password == "postgres") {
		return fmt.Errorf("DB_PASSWORD 必须在生产环境中设置为非默认值")
	}
	if c.Database.Host == "" || c.Database.User == "" || c.Database.DBName == "" {
		return fmt.Errorf("数据库连接配置不完整")
	}
	return nil
}

// IsDev 便于 handler 决定是否回传 devCode。
func (c *Config) IsDev() bool { return c.Server.Mode != "release" }

// —— 帮助函数 ——————————————————————————————————————————————————

func getEnv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getEnvBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}

// parseSyncCombos 解析 "US,ID:1:1,TH" 形态:每段 region[:rankType[:rankField]],
// 后两段省略默认 1(热销榜×销量)。非法段跳过;全空保底 US 热销榜。
func parseSyncCombos(s string) []SyncCombo {
	var out []SyncCombo
	for _, part := range splitCSV(s) {
		seg := strings.Split(part, ":")
		region := strings.ToUpper(strings.TrimSpace(seg[0]))
		if region == "" {
			continue
		}
		c := SyncCombo{Region: region, RankType: 1, RankField: 1}
		if len(seg) > 1 {
			if n, err := strconv.Atoi(strings.TrimSpace(seg[1])); err == nil && n > 0 {
				c.RankType = n
			}
		}
		if len(seg) > 2 {
			if n, err := strconv.Atoi(strings.TrimSpace(seg[2])); err == nil && n > 0 {
				c.RankField = n
			}
		}
		out = append(out, c)
	}
	if len(out) == 0 {
		out = []SyncCombo{{Region: "US", RankType: 1, RankField: 1}}
	}
	return out
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
