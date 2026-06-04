// Package service 业务逻辑层。
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/oneclaw/server/internal/config"
	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
)

const (
	smsCodeTTL     = 5 * time.Minute
	smsMaxAttempts = 5
)

// SMSSender 抽象短信通道。
type SMSSender interface {
	Send(ctx context.Context, phone, code string) error
}

// MockSender 开发模式:把验证码打印到日志。生产环境改 SMS_PROVIDER=tencent(后续阶段接入)。
type MockSender struct{}

func (MockSender) Send(_ context.Context, phone, code string) error {
	logger.Info("[mock-sms] code dispatched", zap.String("phone", phone), zap.String("code", code))
	return nil
}

// SMSService 生成/发送/校验验证码。Phase 1 无 Redis,验证码以哈希落 Postgres。
type SMSService struct {
	db     *gorm.DB
	cfg    *config.SMSConfig
	sender SMSSender
	dev    bool
	rand   *rand.Rand
}

func NewSMSService(db *gorm.DB, cfg *config.SMSConfig, dev bool) *SMSService {
	var sender SMSSender = MockSender{}
	switch strings.ToLower(strings.TrimSpace(cfg.Provider)) {
	case "tencent":
		logger.Warn("[SMS] tencent provider 暂未在 Phase 1 接入,降级到 MockSender")
	default:
		logger.Info("[SMS] 使用 MockSender(验证码打印到日志)")
	}
	return &SMSService{
		db:     db,
		cfg:    cfg,
		sender: sender,
		dev:    dev,
		rand:   rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// Send 生成并发送验证码。返回 devCode(仅 dev 模式非空,便于本地联调)。
func (s *SMSService) Send(ctx context.Context, phone string) (string, error) {
	code := fmt.Sprintf("%06d", s.rand.Intn(1000000))
	rec := model.PhoneVerificationCode{
		Phone:    phone,
		CodeHash: hashCode(code),
		Expires:  time.Now().Add(smsCodeTTL),
	}
	if err := s.db.WithContext(ctx).Create(&rec).Error; err != nil {
		return "", apperr.Wrap(apperr.CodeInternal, "验证码存储失败", err)
	}
	if err := s.sender.Send(ctx, phone, code); err != nil {
		return "", apperr.Wrap(apperr.CodeInternal, "短信发送失败", err)
	}
	if s.dev {
		return code, nil
	}
	return "", nil
}

// Verify 校验最新一条未使用、未过期的验证码。通过即作废。
func (s *SMSService) Verify(ctx context.Context, phone, code string) error {
	var rec model.PhoneVerificationCode
	err := s.db.WithContext(ctx).
		Where("phone = ? AND used_at IS NULL", phone).
		Order("created_at DESC").
		First(&rec).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return apperr.New(apperr.CodeInvalidSMSCode, "请先获取验证码")
	}
	if err != nil {
		return apperr.Wrap(apperr.CodeInternal, "校验失败", err)
	}
	if time.Now().After(rec.Expires) {
		return apperr.New(apperr.CodeInvalidSMSCode, "验证码已过期")
	}
	if rec.Attempts >= smsMaxAttempts {
		return apperr.New(apperr.CodeInvalidSMSCode, "验证次数过多,请重新获取")
	}
	if rec.CodeHash != hashCode(code) {
		s.db.WithContext(ctx).Model(&rec).Update("attempts", rec.Attempts+1)
		return apperr.New(apperr.CodeInvalidSMSCode, "验证码不正确")
	}
	now := time.Now()
	s.db.WithContext(ctx).Model(&rec).Update("used_at", now)
	return nil
}

func hashCode(code string) string {
	h := sha256.Sum256([]byte("oneclaw:" + code))
	return hex.EncodeToString(h[:])
}
