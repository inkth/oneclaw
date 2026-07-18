package service

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestAgencyReferralTokenRoundTripAndTamperProtection(t *testing.T) {
	secret := "agency-referral-secret"
	want := agencyReferralClaims{
		AgencyID: uuid.NewString(), InviteCode: "1112", ClickID: uuid.NewString(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token, err := signAgencyReferralToken(secret, want)
	if err != nil {
		t.Fatalf("signAgencyReferralToken() error = %v", err)
	}
	got, err := parseAgencyReferralToken(secret, token)
	if err != nil {
		t.Fatalf("parseAgencyReferralToken() error = %v", err)
	}
	if got.AgencyID != want.AgencyID || got.InviteCode != want.InviteCode || got.ClickID != want.ClickID {
		t.Fatalf("parseAgencyReferralToken() = %#v, want %#v", got, want)
	}
	if _, err := parseAgencyReferralToken("wrong-secret", token); err == nil {
		t.Fatal("wrong secret should be rejected")
	}
}

func TestAgencyReferralTokenRejectsExpired(t *testing.T) {
	token, err := signAgencyReferralToken("secret", agencyReferralClaims{
		AgencyID: uuid.NewString(), InviteCode: "1112", ClickID: uuid.NewString(),
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute))},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := parseAgencyReferralToken("secret", token); err == nil {
		t.Fatal("expired token should be rejected")
	}
}

func TestAgencyTrackingHelpers(t *testing.T) {
	for _, tc := range []struct {
		value int64
		want  string
	}{{1112, "1112"}, {9999, "9999"}} {
		got, err := formatAgencyInviteCode(tc.value)
		if err != nil || got != tc.want {
			t.Fatalf("formatAgencyInviteCode(%d) = %q, %v", tc.value, got, err)
		}
	}
	if _, err := formatAgencyInviteCode(10000); err == nil {
		t.Fatal("exhausted sequence should be rejected")
	}
	value := strings.Repeat("猫", maxAgencyTrackingValueLength+1)
	if got := len([]rune(limitedAgencyTrackingValue(value))); got != maxAgencyTrackingValueLength {
		t.Fatalf("limited value length = %d", got)
	}
	ip := "203.0.113.10"
	hashed := hashAgencyTrackingIP("secret", ip)
	if len(hashed) != 64 || strings.Contains(hashed, ip) {
		t.Fatalf("hashAgencyTrackingIP() = %q", hashed)
	}
}
