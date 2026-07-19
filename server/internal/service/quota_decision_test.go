package service

import (
	"testing"

	"github.com/faxianmao/server/internal/model"
)

// FREE/PRO 硬上限:边界放行 / 超一积分即拒;非 TEAM 永不计超额。
func TestQuotaDecisionFreePro(t *testing.T) {
	cases := []struct {
		name        string
		plan        string
		kind        string
		qty         int
		used        int
		bonus       int
		wantAllowed bool
	}{
		// FREE=450;出片(VIDEO)=35 积分/秒,用 5s 出片(=175 积分)当测试单元
		{"FREE 首条出片", model.PlanFree, model.UsageVideo, 5, 0, 0, true},
		{"FREE 恰好用满-边界放行", model.PlanFree, model.UsageVideo, 5, 275, 0, true}, // 275+175=450
		{"FREE 超一积分即拒", model.PlanFree, model.UsageVideo, 5, 276, 0, false},   // 451>450
		{"FREE 余量不足整条", model.PlanFree, model.UsageVideo, 5, 350, 0, false},   // 525>450
		// PRO=5600
		{"PRO 余量充足", model.PlanPro, model.UsageVideo, 5, 5000, 0, true},
		{"PRO 恰好用满", model.PlanPro, model.UsageVideo, 5, 5425, 0, true},  // 5425+175=5600
		{"PRO 超一即拒", model.PlanPro, model.UsageVideo, 5, 5426, 0, false}, // 5601>5600
		// 未知方案按 FREE 处理
		{"未知方案按 FREE 限额", "GARBAGE", model.UsageVideo, 5, 350, 0, false},
		// 出图便宜(6/张),批量仍按总额判
		{"FREE 出图十张够", model.PlanFree, model.UsageImage, 10, 0, 0, true}, // 60<=450
		// 赠送积分抬高上限:FREE 450+300=750
		{"FREE+bonus 原超限转放行", model.PlanFree, model.UsageVideo, 5, 350, 300, true}, // 525<=750
		{"FREE+bonus 恰好用满", model.PlanFree, model.UsageVideo, 5, 575, 300, true},   // 575+175=750
		{"FREE+bonus 超一即拒", model.PlanFree, model.UsageVideo, 5, 576, 300, false},  // 751>750
	}
	for _, c := range cases {
		gotAllowed, gotBillable := quotaDecision(c.plan, c.kind, c.qty, c.used, c.bonus)
		if gotAllowed != c.wantAllowed {
			t.Errorf("%s: allowed=%v, want %v", c.name, gotAllowed, c.wantAllowed)
		}
		if gotBillable {
			t.Errorf("%s: 非 TEAM 不应计入超额待结算", c.name)
		}
	}
}

// TEAM 不限量(恒放行),但 used 达基线(11200)后本次标记 billable(待结算)。
func TestQuotaDecisionTeamBaseline(t *testing.T) {
	cases := []struct {
		name         string
		used         int
		wantBillable bool
	}{
		{"零用量不计费", 0, false},
		{"基线内不计费", 11000, false},
		{"恰好达基线即计费", model.TeamBaselineCredits, true}, // 11200>=11200
		{"超基线计费", 15000, true},
	}
	for _, c := range cases {
		allowed, billable := quotaDecision(model.PlanTeam, model.UsageVideo, 1, c.used, 0)
		if !allowed {
			t.Errorf("%s: TEAM 应恒放行(不限量)", c.name)
		}
		if billable != c.wantBillable {
			t.Errorf("%s: billable=%v, want %v", c.name, billable, c.wantBillable)
		}
	}
}

// 周期折扣定价:1 月原价、3 月×2.7、12 月×10.2(8.5 折);非法方案/周期报错。
func TestPriceCents(t *testing.T) {
	cases := []struct {
		plan    string
		months  int
		want    int
		wantErr bool
	}{
		{model.PlanPro, 1, 19900, false},
		{model.PlanPro, 3, 53730, false},   // 19900*2.7
		{model.PlanPro, 12, 202980, false}, // 19900*10.2
		{model.PlanTeam, 1, 39900, false},
		{model.PlanTeam, 12, 406980, false}, // 39900*10.2
		{model.PlanFree, 1, 0, true},        // FREE 不可下单
		{model.PlanPro, 6, 0, true},         // 不支持的周期
	}
	for _, c := range cases {
		got, err := priceCents(c.plan, c.months)
		if c.wantErr {
			if err == nil {
				t.Errorf("priceCents(%s,%d) 应报错", c.plan, c.months)
			}
			continue
		}
		if err != nil {
			t.Errorf("priceCents(%s,%d) 意外报错: %v", c.plan, c.months, err)
			continue
		}
		if got != c.want {
			t.Errorf("priceCents(%s,%d)=%d, want %d", c.plan, c.months, got, c.want)
		}
	}
}
