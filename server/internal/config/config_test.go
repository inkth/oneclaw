package config

import "testing"

func TestLoadMergesBuiltInAndConfiguredAdminPhones(t *testing.T) {
	t.Setenv("ADMIN_PHONES", "13800138000,17602101905")

	adminPhones := Load().Server.AdminPhones
	want := []string{"17602101905", "18916079047", "13800138000"}
	if len(adminPhones) != len(want) {
		t.Fatalf("AdminPhones = %v, want %v", adminPhones, want)
	}
	for i := range want {
		if adminPhones[i] != want[i] {
			t.Fatalf("AdminPhones = %v, want %v", adminPhones, want)
		}
	}
}

func TestLoadAgencyReferralDefaults(t *testing.T) {
	cfg := Load()
	if cfg.Cookie.ReferralName != "oc_ref" || cfg.Agency.ReferralTTLDays != 30 {
		t.Fatalf("agency referral defaults = %q/%d, want oc_ref/30", cfg.Cookie.ReferralName, cfg.Agency.ReferralTTLDays)
	}
}

func TestLoadTextModelDefaults(t *testing.T) {
	t.Setenv("OPENROUTER_MODEL", "")
	t.Setenv("OPENROUTER_ADVISOR_MODEL", "")
	t.Setenv("OPENROUTER_TRANSLATE_MODEL", "")
	t.Setenv("OPENROUTER_REVIEW_MODEL", "")

	cfg := Load().OpenRouter
	got := []string{cfg.Model, cfg.AdvisorModel, cfg.TranslateModel, cfg.ReviewModel}
	for i, model := range got {
		if model != "minimax/minimax-m3" {
			t.Fatalf("text model default[%d] = %q, want minimax/minimax-m3", i, model)
		}
	}
}

func TestLoadAdvisorModelOverride(t *testing.T) {
	t.Setenv("OPENROUTER_ADVISOR_MODEL", "deepseek/deepseek-v4-pro")
	if got := Load().OpenRouter.AdvisorModel; got != "deepseek/deepseek-v4-pro" {
		t.Fatalf("overridden AdvisorModel = %q, want deepseek/deepseek-v4-pro", got)
	}
}
