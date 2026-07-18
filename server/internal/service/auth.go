package service

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/config"
	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
)

// AuthService 账号 + 令牌。手机号 + 短信验证码登录(首次自动注册 + 建默认工作台)。
type AuthService struct {
	db     *gorm.DB
	cfg    *config.Config
	sms    *SMSService
	agency *AgencyService
}

func NewAuthService(db *gorm.DB, cfg *config.Config, sms *SMSService, agency *AgencyService) *AuthService {
	return &AuthService{db: db, cfg: cfg, sms: sms, agency: agency}
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
// inviteCode 仅在首次注册时用于代理商归因绑定(老用户忽略);无效码静默跳过,不阻断登录。
func (s *AuthService) LoginByCode(ctx context.Context, phone, code, inviteCode, referralToken string) (*LoginResult, error) {
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
			// 首次注册:代理商归因绑定 + 赠送积分(同事务;无效码/停用静默 nil)。
			if s.agency != nil {
				if e := s.agency.BindTrackedReferralTx(tx, user.ID, w.ID, inviteCode, referralToken, now); e != nil {
					return e
				}
			}
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
	// 封禁用户拒绝签发会话(新注册用户 BannedAt 恒空,只影响已存在的被封账号)。
	if user.BannedAt != nil {
		return nil, apperr.Forbidden("账号已被封禁,请联系客服")
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

// IsBanned 供 Auth 中间件拦截已封禁账号的活跃会话(单主键查,仅取 banned_at)。
// 查不到 / 出错时保守放行(不因偶发 DB 抖动误锁正常用户;封禁的权威判定在写操作与登录)。
func (s *AuthService) IsBanned(ctx context.Context, userID uuid.UUID) bool {
	var u model.User
	if err := s.db.WithContext(ctx).Select("banned_at").First(&u, "id = ?", userID).Error; err != nil {
		return false
	}
	return u.BannedAt != nil
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

// nicknameMaxRunes 昵称上限(按字符数,不是字节:中文一字算一)。
const nicknameMaxRunes = 20

// UpdateNickname 改当前用户昵称。空白与控制字符先剪掉再校验,避免存进不可见字符。
func (s *AuthService) UpdateNickname(ctx context.Context, userID uuid.UUID, name string) (*model.User, error) {
	name = strings.TrimSpace(name)
	if strings.ContainsFunc(name, func(r rune) bool { return unicode.IsControl(r) }) {
		return nil, apperr.BadRequest("昵称不能包含控制字符")
	}
	if name == "" {
		return nil, apperr.BadRequest("昵称不能为空")
	}
	if utf8.RuneCountInString(name) > nicknameMaxRunes {
		return nil, apperr.BadRequest("昵称最多 20 个字")
	}
	res := s.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", userID).Update("name", name)
	if res.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "更新昵称失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperr.NotFound("用户不存在")
	}
	return s.GetUser(ctx, userID)
}

// TokenTTLSeconds 暴露给 handler 设置 Cookie Max-Age。
func (s *AuthService) TokenTTLSeconds() int { return int(s.cfg.JWT.AccessTTL().Seconds()) }
