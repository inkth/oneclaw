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

	"github.com/faxianmao/server/internal/config"
	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

const (
	smsCodeTTL                    = 5 * time.Minute
	smsMaxAttempts                = 5
	smsPurposeLogin               = "LOGIN"
	smsPurposePartnerRegistration = "PARTNER_REGISTRATION"
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
		if cfg.TencentConfigured() {
			sender = TencentSender{cfg: cfg}
			logger.Info("[SMS] 使用腾讯云短信", zap.String("region", cfg.TencentRegion), zap.String("sign", cfg.TencentSignName))
		} else {
			logger.Warn("[SMS] provider=tencent 但凭证不全,降级到 MockSender")
		}
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
	return s.sendForPurpose(ctx, phone, smsPurposeLogin)
}

// sendForPurpose 生成指定用途的验证码，避免登录码与代理商注册码交叉使用。
func (s *SMSService) sendForPurpose(ctx context.Context, phone, purpose string) (string, error) {
	code := fmt.Sprintf("%06d", s.rand.Intn(1000000))
	rec := model.PhoneVerificationCode{
		Phone:    phone,
		Purpose:  purpose,
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
	return s.verifyForPurpose(ctx, phone, code, smsPurposeLogin)
}

func (s *SMSService) verifyForPurpose(ctx context.Context, phone, code, purpose string) error {
	var rec model.PhoneVerificationCode
	err := s.db.WithContext(ctx).
		Where("phone = ? AND purpose = ? AND used_at IS NULL", phone, purpose).
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
		// 错码累加重试计数(best-effort);写失败仅告警,不改变"验证码不正确"的结论。
		if err := s.db.WithContext(ctx).Model(&rec).Update("attempts", rec.Attempts+1).Error; err != nil {
			logger.Warn("[sms] 重试计数写入失败", logger.String("phone", phone), logger.Err(err))
		}
		return apperr.New(apperr.CodeInvalidSMSCode, "验证码不正确")
	}
	// 原子消费:仅当仍未使用时置 used_at,据 RowsAffected 判定本次是否真正消费成功。
	// 同时堵住「写失败仍放行(可重放)」与「并发请求重复消费同一码」两个窗口。
	res := s.db.WithContext(ctx).Model(&model.PhoneVerificationCode{}).
		Where("id = ? AND used_at IS NULL", rec.ID).
		Update("used_at", time.Now())
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "校验失败", res.Error)
	}
	if res.RowsAffected == 0 {
		// 写未命中:已被并发消费 / 瞬时未更新 → 不放行,要求重新获取。
		return apperr.New(apperr.CodeInvalidSMSCode, "验证码已失效,请重新获取")
	}
	return nil
}

func hashCode(code string) string {
	h := sha256.Sum256([]byte("faxianmao:" + code))
	return hex.EncodeToString(h[:])
}
