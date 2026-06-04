package service

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/oneclaw/server/internal/config"
	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
)

// AuthService 账号 + 令牌。手机号 + 短信验证码登录(首次自动注册 + 建默认工作台)。
type AuthService struct {
	db  *gorm.DB
	cfg *config.Config
	sms *SMSService
}

func NewAuthService(db *gorm.DB, cfg *config.Config, sms *SMSService) *AuthService {
	return &AuthService{db: db, cfg: cfg, sms: sms}
}

// SendCode 发送登录验证码,返回 devCode(仅 dev 非空)。
func (s *AuthService) SendCode(ctx context.Context, phone string) (string, error) {
	return s.sms.Send(ctx, phone)
}

// LoginResult 登录结果:用户 + 默认工作台 + 已签发的 JWT。
type LoginResult struct {
	User      *model.User
	Workspace *model.Workspace
	Token     string
}

// LoginByCode 手机号 + 验证码登录,首次自动注册并建默认工作台。
func (s *AuthService) LoginByCode(ctx context.Context, phone, code string) (*LoginResult, error) {
	if err := s.sms.Verify(ctx, phone, code); err != nil {
		return nil, err
	}

	var user model.User
	var ws *model.Workspace

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		e := tx.Where("phone = ?", phone).First(&user).Error
		if errors.Is(e, gorm.ErrRecordNotFound) {
			phoneVal := phone
			now := time.Now()
			name := "跨境卖家"
			user = model.User{Phone: &phoneVal, PhoneVerified: &now, Name: &name}
			if e := tx.Create(&user).Error; e != nil {
				return e
			}
			w, e := createDefaultForUser(tx, user.ID, "")
			if e != nil {
				return e
			}
			ws = w
			return nil
		} else if e != nil {
			return e
		}
		// 已存在用户:取其默认工作台。
		var mem model.Membership
		if e := tx.Where("user_id = ?", user.ID).Order("created_at ASC").First(&mem).Error; e != nil {
			if errors.Is(e, gorm.ErrRecordNotFound) {
				w, e2 := createDefaultForUser(tx, user.ID, "")
				if e2 != nil {
					return e2
				}
				ws = w
				return nil
			}
			return e
		}
		var w model.Workspace
		if e := tx.First(&w, "id = ?", mem.WorkspaceID).Error; e != nil {
			return e
		}
		ws = &w
		return nil
	})
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "登录失败", err)
	}

	tok, err := s.GenerateToken(user.ID, s.roleFor(phone))
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "签发令牌失败", err)
	}
	return &LoginResult{User: &user, Workspace: ws, Token: tok}, nil
}

func (s *AuthService) roleFor(phone string) string {
	for _, p := range s.cfg.Server.AdminPhones {
		if p == phone {
			return "admin"
		}
	}
	return "user"
}

// GenerateToken 签发 JWT。Claims:user_id (uuid) + role + 标准时间字段。
func (s *AuthService) GenerateToken(userID uuid.UUID, role string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"user_id": userID.String(),
		"role":    role,
		"iat":     now.Unix(),
		"exp":     now.Add(s.cfg.JWT.AccessTTL()).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(s.cfg.JWT.Secret))
}

// ValidateToken 实现 middleware.TokenValidator。
func (s *AuthService) ValidateToken(token string) (uuid.UUID, string, error) {
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.JWT.Secret), nil
	})
	if err != nil {
		return uuid.Nil, "", err
	}
	uidStr, _ := claims["user_id"].(string)
	role, _ := claims["role"].(string)
	uid, err := uuid.Parse(uidStr)
	if err != nil {
		return uuid.Nil, "", err
	}
	return uid, role, nil
}

// GetUser 取当前登录用户。
func (s *AuthService) GetUser(ctx context.Context, userID uuid.UUID) (*model.User, error) {
	var u model.User
	if err := s.db.WithContext(ctx).First(&u, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("用户不存在")
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "查询用户失败", err)
	}
	return &u, nil
}

// TokenTTLSeconds 暴露给 handler 设置 Cookie Max-Age。
func (s *AuthService) TokenTTLSeconds() int { return int(s.cfg.JWT.AccessTTL().Seconds()) }
