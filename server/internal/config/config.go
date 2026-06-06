// Package config 加载并校验 oneclaw-server 的运行时配置。
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
	Server    ServerConfig
	Database  DatabaseConfig
	JWT       JWTConfig
	Cookie    CookieConfig
	RateLimit RateLimitConfig
	SMS       SMSConfig
	EchoTik   EchoTikConfig
	Storage   StorageConfig
	CORS      CORSConfig
	Log       LogConfig
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
	Provider          string // mock | tencent(tencent 在后续阶段接入)
	TencentSecretID   string
	TencentSecretKey  string
	TencentSDKAppID   string
	TencentSignName   string
	TencentTemplateID string
}

// EchoTikConfig EchoTik 开放 API(TikTok Shop 选品数据源)。HTTP Basic Auth。
type EchoTikConfig struct {
	BaseURL  string
	Username string
	Password string
}

func (e EchoTikConfig) Configured() bool { return e.Username != "" && e.Password != "" }

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
			DBName:       getEnv("DB_NAME", "oneclaw"),
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
		},
		EchoTik: EchoTikConfig{
			BaseURL:  getEnv("ECHOTIK_BASE_URL", "https://open.echotik.live/api/v3"),
			Username: getEnv("ECHOTIK_USERNAME", ""),
			Password: getEnv("ECHOTIK_PASSWORD", ""),
		},
		Storage: StorageConfig{
			COSBucket:    getEnv("TENCENT_COS_BUCKET", ""),
			COSRegion:    getEnv("TENCENT_COS_REGION", ""),
			COSSecretID:  getEnv("TENCENT_SECRET_ID", ""),
			COSSecretKey: getEnv("TENCENT_SECRET_KEY", ""),
			COSDomain:    getEnv("TENCENT_COS_DOMAIN", ""),
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
