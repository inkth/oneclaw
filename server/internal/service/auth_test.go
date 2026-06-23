package service

import (
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/config"
)

// authSvc 构造一个仅含 JWT 配置的 AuthService(GenerateToken/ValidateToken 不触 DB)。
func authSvc(secret string, expireHour int) *AuthService {
	return &AuthService{cfg: &config.Config{JWT: config.JWTConfig{Secret: secret, ExpireHour: expireHour}}}
}

// 正常签发→校验:uid 与 role 往返一致。
func TestTokenRoundTrip(t *testing.T) {
	s := authSvc("s3cr3t-please-change", 1)
	uid := uuid.New()
	tok, err := s.GenerateToken(uid, "admin")
	if err != nil {
		t.Fatalf("签发失败: %v", err)
	}
	gotUID, gotRole, err := s.ValidateToken(tok)
	if err != nil {
		t.Fatalf("校验失败: %v", err)
	}
	if gotUID != uid {
		t.Errorf("uid 不一致: got %s want %s", gotUID, uid)
	}
	if gotRole != "admin" {
		t.Errorf("role 不一致: got %s want admin", gotRole)
	}
}

// 换密钥必须校验失败 —— 否则等于可伪造任意令牌。
func TestValidateRejectsWrongSecret(t *testing.T) {
	signer := authSvc("secret-A", 1)
	verifier := authSvc("secret-B", 1)
	tok, _ := signer.GenerateToken(uuid.New(), "user")
	if _, _, err := verifier.ValidateToken(tok); err == nil {
		t.Fatal("换密钥应校验失败,却通过了(可伪造令牌)")
	}
}

// 篡改签名段必须被拒。
func TestValidateRejectsTampered(t *testing.T) {
	s := authSvc("secret", 1)
	tok, _ := s.GenerateToken(uuid.New(), "user")
	tampered := tok[:len(tok)-1]
	if tok[len(tok)-1] == 'a' {
		tampered += "b"
	} else {
		tampered += "a"
	}
	if _, _, err := s.ValidateToken(tampered); err == nil {
		t.Fatal("被篡改的令牌应校验失败")
	}
}

// 过期令牌必须被拒(ExpireHour=-1 → exp 落在过去 1 小时)。
func TestValidateRejectsExpired(t *testing.T) {
	s := authSvc("secret", -1)
	tok, _ := s.GenerateToken(uuid.New(), "user")
	if _, _, err := s.ValidateToken(tok); err == nil {
		t.Fatal("过期令牌应校验失败")
	}
}

// 关键安全回归:防 alg 混淆 / none 攻击。ValidateToken 强校验 *jwt.SigningMethodHMAC,
// alg=none 的令牌(无需密钥即可构造)必须被拒,否则可无密钥伪造任意身份。
func TestValidateRejectsNoneAlg(t *testing.T) {
	s := authSvc("secret", 1)
	claims := jwt.MapClaims{"user_id": uuid.New().String(), "role": "admin"}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("构造 none 令牌失败: %v", err)
	}
	if _, _, err := s.ValidateToken(tok); err == nil {
		t.Fatal("alg=none 令牌必须被拒(否则可无密钥伪造)")
	}
}

// 非法/空串令牌一律被拒。
func TestValidateRejectsMalformed(t *testing.T) {
	s := authSvc("secret", 1)
	for _, bad := range []string{"", "not-a-jwt", "a.b.c"} {
		if _, _, err := s.ValidateToken(bad); err == nil {
			t.Errorf("非法令牌 %q 应被拒", bad)
		}
	}
}
