package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
)

const maxAgencyTrackingValueLength = 500

type AgencyVisitInput struct {
	InviteCode    string
	ExistingToken string
	LandingPath   string
	UTMSource     string
	UTMMedium     string
	UTMCampaign   string
	Referer       string
	UserAgent     string
	ClientIP      string
}

type AgencyVisitResult struct {
	Valid      bool      `json:"valid"`
	InviteCode string    `json:"inviteCode,omitempty"`
	Token      string    `json:"token,omitempty"`
	ExpiresAt  time.Time `json:"expiresAt,omitempty"`
}

type agencyReferralClaims struct {
	AgencyID   string `json:"agencyId"`
	InviteCode string `json:"inviteCode"`
	ClickID    string `json:"clickId"`
	jwt.RegisteredClaims
}

// RecordVisit 校验代理短链、记录访问，并签发首个有效归因凭证。
func (s *AgencyService) RecordVisit(ctx context.Context, in AgencyVisitInput) (*AgencyVisitResult, error) {
	requestedCode := normalizeAgencyCode(in.InviteCode)
	if requestedCode == "" {
		return &AgencyVisitResult{Valid: false}, nil
	}

	requestedAgency, err := s.findActiveAgencyByCode(s.db.WithContext(ctx), requestedCode)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &AgencyVisitResult{Valid: false}, nil
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "校验邀请码失败", err)
	}

	click := model.AgencyReferralClick{
		AgencyID:    requestedAgency.ID,
		InviteCode:  requestedCode,
		LandingPath: limitedAgencyTrackingValue(in.LandingPath),
		UTMSource:   limitedAgencyTrackingValue(in.UTMSource),
		UTMMedium:   limitedAgencyTrackingValue(in.UTMMedium),
		UTMCampaign: limitedAgencyTrackingValue(in.UTMCampaign),
		Referer:     limitedAgencyTrackingValue(in.Referer),
		UserAgent:   limitedAgencyTrackingValue(in.UserAgent),
		IPHash:      hashAgencyTrackingIP(s.cfg.ReferralSecret, in.ClientIP),
	}
	if click.LandingPath == "" {
		click.LandingPath = "/r/" + requestedCode
	}
	if err := s.db.WithContext(ctx).Create(&click).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "记录邀请访问失败", err)
	}

	// 首个仍有效且代理仍启用的 Cookie 优先；后续短链只计点击，不覆盖归属。
	if claims, parseErr := parseAgencyReferralToken(s.cfg.ReferralSecret, in.ExistingToken); parseErr == nil {
		agencyID, idErr := uuid.Parse(claims.AgencyID)
		if idErr == nil {
			var count int64
			queryErr := s.db.WithContext(ctx).Model(&model.Agency{}).Where(
				"id = ? AND code = ? AND status = ?",
				agencyID,
				claims.InviteCode,
				model.AgencyActive,
			).Count(&count).Error
			if queryErr != nil {
				return nil, apperr.Wrap(apperr.CodeInternal, "校验已有邀请归因失败", queryErr)
			}
			if count == 1 {
				return &AgencyVisitResult{
					Valid:      true,
					InviteCode: claims.InviteCode,
					Token:      in.ExistingToken,
					ExpiresAt:  claims.ExpiresAt.Time,
				}, nil
			}
		}
	}

	expiresAt := time.Now().Add(time.Duration(s.cfg.ReferralTTLDays) * 24 * time.Hour)
	token, err := signAgencyReferralToken(s.cfg.ReferralSecret, agencyReferralClaims{
		AgencyID:   requestedAgency.ID.String(),
		InviteCode: requestedCode,
		ClickID:    click.ID.String(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "生成邀请归因凭证失败", err)
	}
	return &AgencyVisitResult{Valid: true, InviteCode: requestedCode, Token: token, ExpiresAt: expiresAt}, nil
}

func signAgencyReferralToken(secret string, claims agencyReferralClaims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

func parseAgencyReferralToken(secret, raw string) (*agencyReferralClaims, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, errors.New("empty referral token")
	}
	claims := &agencyReferralClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected referral signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid || claims.ExpiresAt == nil {
		return nil, errors.New("invalid referral token")
	}
	if _, err := uuid.Parse(claims.AgencyID); err != nil {
		return nil, errors.New("invalid referral agency")
	}
	if _, err := uuid.Parse(claims.ClickID); err != nil {
		return nil, errors.New("invalid referral click")
	}
	claims.InviteCode = normalizeAgencyCode(claims.InviteCode)
	if claims.InviteCode == "" {
		return nil, errors.New("incomplete referral token")
	}
	return claims, nil
}

func normalizeAgencyCode(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if value == "" || len(value) > 32 {
		return ""
	}
	return value
}

func limitedAgencyTrackingValue(value string) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > maxAgencyTrackingValueLength {
		return string(runes[:maxAgencyTrackingValueLength])
	}
	return value
}

func hashAgencyTrackingIP(secret, ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(secret + "|agency-referral|" + ip))
	return hex.EncodeToString(sum[:])
}

func formatAgencyInviteCode(value int64) (string, error) {
	if value < 1112 || value > 9999 {
		return "", fmt.Errorf("邀请码号段已用尽")
	}
	return fmt.Sprintf("%04d", value), nil
}
