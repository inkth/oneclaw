package model

import (
	"testing"
	"time"
)

func TestAgencyReferralCommissionWindow(t *testing.T) {
	createdAt := time.Date(2025, time.July, 17, 10, 30, 0, 0, time.FixedZone("CST", 8*60*60))
	ref := AgencyReferral{CreatedAt: createdAt}

	tests := []struct {
		name string
		at   time.Time
		want bool
	}{
		{name: "before registration", at: createdAt.Add(-time.Nanosecond), want: false},
		{name: "at registration", at: createdAt, want: true},
		{name: "before anniversary", at: createdAt.AddDate(1, 0, 0).Add(-time.Nanosecond), want: true},
		{name: "at anniversary", at: createdAt.AddDate(1, 0, 0), want: false},
		{name: "after anniversary", at: createdAt.AddDate(1, 0, 1), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ref.CommissionEligibleAt(tt.at); got != tt.want {
				t.Fatalf("CommissionEligibleAt(%s) = %v, want %v", tt.at, got, tt.want)
			}
		})
	}
}

func TestAgencyReferralCommissionWindowUsesStoredDeadline(t *testing.T) {
	createdAt := time.Date(2025, time.July, 17, 10, 30, 0, 0, time.UTC)
	customUntil := createdAt.Add(30 * 24 * time.Hour)
	ref := AgencyReferral{CreatedAt: createdAt, CommissionEligibleUntil: &customUntil}

	if ref.CommissionEligibleAt(customUntil) {
		t.Fatal("stored deadline must be exclusive")
	}
}
