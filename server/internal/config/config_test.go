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
