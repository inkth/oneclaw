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

func TestLoadAdvisorModelDefaultAndOverride(t *testing.T) {
	t.Setenv("OPENROUTER_ADVISOR_MODEL", "")
	if got := Load().OpenRouter.AdvisorModel; got != "qwen/qwen3.7-plus" {
		t.Fatalf("default AdvisorModel = %q, want qwen/qwen3.7-plus", got)
	}

	t.Setenv("OPENROUTER_ADVISOR_MODEL", "deepseek/deepseek-v4-pro")
	if got := Load().OpenRouter.AdvisorModel; got != "deepseek/deepseek-v4-pro" {
		t.Fatalf("overridden AdvisorModel = %q, want deepseek/deepseek-v4-pro", got)
	}
}
