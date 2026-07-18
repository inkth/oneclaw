package service

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/config"
	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
)

// 跑法:FAXIANMAO_TEST_DB_DSN="host=localhost port=5432 user=... dbname=faxianmao_agency_test sslmode=disable" \
//   go test ./internal/service/ -run TestAgency -v
// 不设 DSN 则 skip(沙箱无 PG)。TestMain 由 discover_backfill_db_test.go 提供,同包不重复。

var agencyTestTables = []any{
	&model.User{}, &model.Workspace{}, &model.Membership{},
	&model.PaymentOrder{}, &model.OverflowBill{}, &model.UsageRecord{},
	&model.Agency{}, &model.AgencyReferral{}, &model.AgencyReferralClick{}, &model.CommissionRecord{},
	&model.AgencyWithdrawal{}, &model.BonusCreditGrant{},
}

func TestAgencyTrackedReferralFlow(t *testing.T) {
	db := openAgencyTestDB(t)
	svc := NewAgencyService(db, config.AgencyConfig{
		BonusCredits: 300, DefaultCommissionBP: 2000,
		ReferralSecret: "tracked-referral-test", ReferralTTLDays: 30,
	})
	ag := mkAgency(t, db, mkUser(t, db, "13800000005"), 2000, model.AgencyActive)
	result, err := svc.RecordVisit(context.Background(), AgencyVisitInput{
		InviteCode: ag.Code, LandingPath: "/r/" + ag.Code, UTMSource: "wechat",
	})
	if err != nil || !result.Valid || result.Token == "" {
		t.Fatalf("RecordVisit() = %#v, %v", result, err)
	}

	newUser := mkUser(t, db, "13800000006")
	ws := mkWorkspace(t, db, newUser, model.PlanFree)
	if err := db.Transaction(func(tx *gorm.DB) error {
		return svc.BindTrackedReferralTx(tx, newUser, ws.ID, "WRONG", result.Token, time.Now())
	}); err != nil {
		t.Fatalf("BindTrackedReferralTx() error = %v", err)
	}

	var ref model.AgencyReferral
	if err := db.Where("user_id = ?", newUser).First(&ref).Error; err != nil {
		t.Fatalf("查询归因失败: %v", err)
	}
	if ref.ClickID == nil || ref.AttributionSource != model.ReferralSourceLink || ref.AgencyID != ag.ID {
		t.Fatalf("归因记录 = %#v", ref)
	}
	var click model.AgencyReferralClick
	if err := db.First(&click, "id = ?", *ref.ClickID).Error; err != nil {
		t.Fatalf("查询点击失败: %v", err)
	}
	if click.ConvertedUserID == nil || *click.ConvertedUserID != newUser || click.ConvertedAt == nil {
		t.Fatalf("点击转化未回写: %#v", click)
	}
}

func openAgencyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("FAXIANMAO_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("FAXIANMAO_TEST_DB_DSN 未设置,跳过 DB 集成测试")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接测试库失败: %v", err)
	}
	_ = db.Migrator().DropTable(agencyTestTables...)
	if err := db.AutoMigrate(agencyTestTables...); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	return db
}

func mkUser(t *testing.T, db *gorm.DB, phone string) uuid.UUID {
	t.Helper()
	p := phone
	u := model.User{Phone: &p}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("建用户失败: %v", err)
	}
	return u.ID
}

func mkWorkspace(t *testing.T, db *gorm.DB, ownerID uuid.UUID, plan string) model.Workspace {
	t.Helper()
	ws := model.Workspace{Name: "测试台", Slug: "ws-" + randomCode(6), Plan: plan, OwnerID: ownerID}
	if err := db.Create(&ws).Error; err != nil {
		t.Fatalf("建工作台失败: %v", err)
	}
	return ws
}

func mkAgency(t *testing.T, db *gorm.DB, userID uuid.UUID, bp int, status string) model.Agency {
	t.Helper()
	ag := model.Agency{UserID: userID, Code: randomCode(8), CommissionBP: bp, Status: status}
	if err := db.Create(&ag).Error; err != nil {
		t.Fatalf("建代理失败: %v", err)
	}
	return ag
}

func commissionCount(t *testing.T, db *gorm.DB, sourceID uuid.UUID) int64 {
	t.Helper()
	var n int64
	db.Model(&model.CommissionRecord{}).Where("source_id = ?", sourceID).Count(&n)
	return n
}

// 绑定幂等:两次绑定各 1 行;停用代理码静默不绑。
func TestAgencyBindReferral(t *testing.T) {
	db := openAgencyTestDB(t)
	svc := NewAgencyService(db, config.AgencyConfig{BonusCredits: 300, DefaultCommissionBP: 2000})
	now := time.Now()

	ag := mkAgency(t, db, mkUser(t, db, "13800000001"), 2000, model.AgencyActive)
	newUser := mkUser(t, db, "13800000002")
	ws := mkWorkspace(t, db, newUser, model.PlanFree)

	for i := 0; i < 2; i++ {
		if err := db.Transaction(func(tx *gorm.DB) error {
			return svc.BindReferralTx(tx, newUser, ws.ID, ag.Code, now)
		}); err != nil {
			t.Fatalf("绑定失败: %v", err)
		}
	}
	var refCount, grantCount int64
	db.Model(&model.AgencyReferral{}).Where("user_id = ?", newUser).Count(&refCount)
	db.Model(&model.BonusCreditGrant{}).Where("user_id = ?", newUser).Count(&grantCount)
	if refCount != 1 {
		t.Errorf("归因行数=%d, want 1", refCount)
	}
	if grantCount != 1 {
		t.Errorf("赠送积分行数=%d, want 1", grantCount)
	}

	// 停用代理码:静默忽略,不绑不报错。
	dis := mkAgency(t, db, mkUser(t, db, "13800000003"), 2000, model.AgencyDisabled)
	u4 := mkUser(t, db, "13800000004")
	ws4 := mkWorkspace(t, db, u4, model.PlanFree)
	if err := db.Transaction(func(tx *gorm.DB) error {
		return svc.BindReferralTx(tx, u4, ws4.ID, dis.Code, now)
	}); err != nil {
		t.Fatalf("停用码绑定应静默: %v", err)
	}
	var c int64
	db.Model(&model.AgencyReferral{}).Where("user_id = ?", u4).Count(&c)
	if c != 0 {
		t.Errorf("停用码不应绑定, got %d", c)
	}
}

// 订阅计佣幂等:markPaid 两次仅 1 条佣金,金额=base*bp/10000;直接重复 RecordCommissionTx 仍 1 条。
func TestAgencyCommissionOnOrder(t *testing.T) {
	db := openAgencyTestDB(t)
	ctx := context.Background()
	agencySvc := NewAgencyService(db, config.AgencyConfig{DefaultCommissionBP: 2000})
	bill := NewBillingService(db, true, agencySvc, false)

	ag := mkAgency(t, db, mkUser(t, db, "13800000010"), 2000, model.AgencyActive)
	payer := mkUser(t, db, "13800000011")
	ws := mkWorkspace(t, db, payer, model.PlanFree)
	db.Create(&model.AgencyReferral{UserID: payer, AgencyID: ag.ID})

	o := model.PaymentOrder{
		WorkspaceID: ws.ID, UserID: payer, OutTradeNo: "T-ORDER-1",
		Plan: model.PlanPro, PeriodMonths: 1, AmountCents: 19900,
		Provider: model.PayWechat, Status: model.OrderPending, IsMock: false,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := db.Create(&o).Error; err != nil {
		t.Fatal(err)
	}
	if err := bill.markPaid(ctx, &o); err != nil {
		t.Fatalf("首次 markPaid 失败: %v", err)
	}
	if err := bill.markPaid(ctx, &o); err == nil {
		t.Error("重复 markPaid 应报「已处理」")
	}
	if n := commissionCount(t, db, o.ID); n != 1 {
		t.Fatalf("佣金行数=%d, want 1", n)
	}
	var rec model.CommissionRecord
	db.First(&rec, "source_id = ?", o.ID)
	if rec.AmountCents != 3980 {
		t.Errorf("佣金金额=%d, want 3980 (19900*20%%)", rec.AmountCents)
	}
	// 唯一索引兜底:同 source 再插入空转。
	_ = db.Transaction(func(tx *gorm.DB) error {
		return agencySvc.RecordCommissionTx(tx, model.CommissionSourceOrder, o.ID, payer, 19900, time.Now())
	})
	if n := commissionCount(t, db, o.ID); n != 1 {
		t.Errorf("重复计佣后行数=%d, want 1", n)
	}
}

// mock 支付计佣开关:关闭时 0 条,打开时 1 条。
func TestAgencyCommissionMockGate(t *testing.T) {
	db := openAgencyTestDB(t)
	ctx := context.Background()
	agencySvc := NewAgencyService(db, config.AgencyConfig{DefaultCommissionBP: 2000})

	ag := mkAgency(t, db, mkUser(t, db, "13800000020"), 2000, model.AgencyActive)
	payer := mkUser(t, db, "13800000021")
	ws := mkWorkspace(t, db, payer, model.PlanFree)
	db.Create(&model.AgencyReferral{UserID: payer, AgencyID: ag.ID})

	mkOrder := func(no string) *model.PaymentOrder {
		o := model.PaymentOrder{
			WorkspaceID: ws.ID, UserID: payer, OutTradeNo: no,
			Plan: model.PlanPro, PeriodMonths: 1, AmountCents: 19900,
			Provider: model.PayWechat, Status: model.OrderPending, IsMock: true,
			ExpiresAt: time.Now().Add(time.Hour),
		}
		if err := db.Create(&o).Error; err != nil {
			t.Fatal(err)
		}
		return &o
	}

	// 开关关:mock 不计佣。
	billOff := NewBillingService(db, true, agencySvc, false)
	o1 := mkOrder("T-MOCK-OFF")
	if err := billOff.markPaid(ctx, o1); err != nil {
		t.Fatal(err)
	}
	if n := commissionCount(t, db, o1.ID); n != 0 {
		t.Errorf("mock 开关关:佣金=%d, want 0", n)
	}

	// 开关开(dev):mock 计佣。
	billOn := NewBillingService(db, true, agencySvc, true)
	o2 := mkOrder("T-MOCK-ON")
	if err := billOn.markPaid(ctx, o2); err != nil {
		t.Fatal(err)
	}
	if n := commissionCount(t, db, o2.ID); n != 1 {
		t.Errorf("mock 开关开:佣金=%d, want 1", n)
	}
}

// 超额账单结算:按 workspace owner 归因计佣;重复结算仍 1 条。
func TestAgencyCommissionOnOverflow(t *testing.T) {
	db := openAgencyTestDB(t)
	ctx := context.Background()
	agencySvc := NewAgencyService(db, config.AgencyConfig{DefaultCommissionBP: 2000})
	bill := NewBillingService(db, false, agencySvc, false) // 生产模式:超额结算恒计佣

	ag := mkAgency(t, db, mkUser(t, db, "13800000030"), 2000, model.AgencyActive)
	owner := mkUser(t, db, "13800000031")
	ws := mkWorkspace(t, db, owner, model.PlanTeam)
	db.Create(&model.AgencyReferral{UserID: owner, AgencyID: ag.ID})

	ob := model.OverflowBill{
		WorkspaceID: ws.ID, Period: "2026-01-01",
		PeriodStart: time.Now().Add(-720 * time.Hour), PeriodEnd: time.Now().Add(-360 * time.Hour),
		BillableCredits: 1000, AmountCents: 4500, Status: model.OverflowPending, OutTradeNo: "OB-1",
	}
	if err := db.Create(&ob).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := bill.MarkOverflowPaid(ctx, ws.ID, ob.ID, "对账"); err != nil {
		t.Fatalf("结算失败: %v", err)
	}
	if n := commissionCount(t, db, ob.ID); n != 1 {
		t.Fatalf("超额佣金行数=%d, want 1", n)
	}
	var rec model.CommissionRecord
	db.First(&rec, "source_id = ?", ob.ID)
	if rec.AmountCents != 900 {
		t.Errorf("超额佣金金额=%d, want 900 (4500*20%%)", rec.AmountCents)
	}
	// 重复结算:报错且仍 1 条。
	if _, err := bill.MarkOverflowPaid(ctx, ws.ID, ob.ID, "重复"); err == nil {
		t.Error("重复结算应报错")
	}
	if n := commissionCount(t, db, ob.ID); n != 1 {
		t.Errorf("重复结算后行数=%d, want 1", n)
	}
}

// 赠送积分抬高周期上限:750 内放行、超出拒;过期后回落 450。
func TestAgencyBonusQuota(t *testing.T) {
	db := openAgencyTestDB(t)
	ctx := context.Background()
	quota := NewQuotaService(db)

	owner := mkUser(t, db, "13800000040")
	ws := mkWorkspace(t, db, owner, model.PlanFree)
	db.Create(&model.BonusCreditGrant{
		WorkspaceID: ws.ID, UserID: owner, Credits: 300,
		Source: model.BonusSourceAgencyInvite, ExpiresAt: time.Now().Add(24 * time.Hour),
	})

	// FREE 450 + bonus 300 = 750;按秒计费 35/秒,5s 出片=175 积分,4 条=700<=750 放行。
	for i := 0; i < 4; i++ {
		if err := quota.CheckAndRecord(ctx, ws.ID, model.UsageVideo, 5, nil); err != nil {
			t.Fatalf("第 %d 条出片应放行: %v", i+1, err)
		}
	}
	// 第 5 条:700+175=875 > 750,拒。
	if err := quota.CheckAndRecord(ctx, ws.ID, model.UsageVideo, 5, nil); err == nil {
		t.Error("超 750 应拒")
	}
	// 赠送过期 → 上限回 450,已用 700 > 450,出图(6)也拒。
	db.Model(&model.BonusCreditGrant{}).Where("workspace_id = ?", ws.ID).
		Update("expires_at", time.Now().Add(-time.Hour))
	if err := quota.CheckAndRecord(ctx, ws.ID, model.UsageImage, 1, nil); err == nil {
		t.Error("赠送过期后超 450 应拒")
	}
}

// 提现余额:超额拒、PENDING 占用、REJECTED 释放。
func TestAgencyWithdrawal(t *testing.T) {
	db := openAgencyTestDB(t)
	ctx := context.Background()
	svc := NewAgencyService(db, config.AgencyConfig{DefaultCommissionBP: 2000})

	agencyUser := mkUser(t, db, "13800000050")
	ag := mkAgency(t, db, agencyUser, 2000, model.AgencyActive)
	db.Create(&model.CommissionRecord{
		AgencyID: ag.ID, UserID: mkUser(t, db, "13800000051"),
		SourceType: model.CommissionSourceOrder, SourceID: uuid.New(),
		BaseAmountCents: 19900, CommissionBP: 2000, AmountCents: 3980,
	})

	if _, err := svc.RequestWithdrawal(ctx, agencyUser, 5000, "微信"); err == nil {
		t.Error("超余额提现应拒")
	}
	w, err := svc.RequestWithdrawal(ctx, agencyUser, 3980, "微信")
	if err != nil {
		t.Fatalf("等额提现应成功: %v", err)
	}
	if _, err := svc.RequestWithdrawal(ctx, agencyUser, 1, "微信"); err == nil {
		t.Error("PENDING 占用余额,再提现应拒")
	}
	// 驳回 → 释放余额。
	if _, err := svc.AdminReviewWithdrawal(ctx, w.ID, agencyUser, false, "驳回测试"); err != nil {
		t.Fatalf("驳回失败: %v", err)
	}
	if _, err := svc.RequestWithdrawal(ctx, agencyUser, 3980, "微信"); err != nil {
		t.Errorf("驳回后余额应释放,提现应成功: %v", err)
	}
}

// resetInviteCodeSeq 重建发号 sequence(fixture 的 AutoMigrate 不含 raw DDL)。
func resetInviteCodeSeq(t *testing.T, db *gorm.DB, start int64) {
	t.Helper()
	db.Exec("DROP SEQUENCE IF EXISTS agency_invite_code_seq")
	// DDL 不接受 bind 参数,start 由测试自身提供,直接拼接。
	ddl := fmt.Sprintf(`CREATE SEQUENCE agency_invite_code_seq
		START WITH %d MINVALUE 1112 MAXVALUE 9999 NO CYCLE`, start)
	if err := db.Exec(ddl).Error; err != nil {
		t.Fatalf("建 sequence 失败: %v", err)
	}
}

func TestIsUnluckyInviteCode(t *testing.T) {
	// 含 4 即忌讳,不只末位。
	for _, c := range []struct {
		value   int64
		unlucky bool
	}{
		{1112, false}, {1113, false},
		{1114, true}, // 末位
		{1140, true}, // 十位
		{1400, true}, // 百位
		{4000, true}, // 千位
		{1444, true},
		{9999, false},
	} {
		if got := isUnluckyInviteCode(c.value); got != c.unlucky {
			t.Errorf("isUnluckyInviteCode(%d) = %v, 期望 %v", c.value, got, c.unlucky)
		}
	}
}

// 连号段整段含 4 时(1140-1149)应一次跳完,不是只跳末位。
func TestNextInviteCodeSkipsWholeUnluckyRange(t *testing.T) {
	db := openAgencyTestDB(t)
	resetInviteCodeSeq(t, db, 1139)
	got := make([]string, 0, 2)
	for i := 0; i < 2; i++ {
		code, err := nextInviteCode(db)
		if err != nil {
			t.Fatalf("nextInviteCode() error = %v", err)
		}
		got = append(got, code)
	}
	// 1140-1149 全含 4,应整段跳过直达 1150。
	if got[0] != "1139" || got[1] != "1150" {
		t.Errorf("发号序列 = %v, 期望 [1139 1150]", got)
	}
}

// AdminCreate 两条不变量:发号跳过含 4 的号;手机号无账号时一并建号(含工作台与 OWNER 成员)。
func TestAdminCreateSkipsUnluckyCodeAndCreatesUser(t *testing.T) {
	db := openAgencyTestDB(t)
	resetInviteCodeSeq(t, db, 1112)
	ctx := context.Background()
	svc := NewAgencyService(db, config.AgencyConfig{DefaultCommissionBP: 2000})

	// 前两个手机号已有账号,后两个全新 → 顺带覆盖建号分支。
	mkUser(t, db, "13600000001")
	mkUser(t, db, "13600000002")
	phones := []string{"13600000001", "13600000002", "13600000003", "13600000004"}

	var got []string
	for _, p := range phones {
		ag, err := svc.AdminCreate(ctx, p, 0, "")
		if err != nil {
			t.Fatalf("AdminCreate(%s) error = %v", p, err)
		}
		got = append(got, ag.Code)
	}
	// 1114 尾数为 4,应被跳过。
	want := []string{"1112", "1113", "1115", "1116"}
	for i, w := range want {
		if got[i] != w {
			t.Errorf("第 %d 个邀请码 = %s, 期望 %s(完整序列 %v)", i+1, got[i], w, got)
		}
	}

	// 全新手机号应建出 users + workspace + OWNER membership,缺一会让懒修复逻辑重复建台。
	for _, p := range []string{"13600000003", "13600000004"} {
		var u model.User
		if err := db.Where("phone = ?", p).First(&u).Error; err != nil {
			t.Fatalf("%s 应已建号: %v", p, err)
		}
		if u.PhoneVerified == nil {
			t.Errorf("%s phone_verified 应非空(注册时已过短信验证)", p)
		}
		var mem model.Membership
		if err := db.Where("user_id = ?", u.ID).First(&mem).Error; err != nil {
			t.Fatalf("%s 应有 membership: %v", p, err)
		}
		if mem.Role != model.RoleOwner {
			t.Errorf("%s membership 角色 = %s, 期望 %s", p, mem.Role, model.RoleOwner)
		}
		var ws model.Workspace
		if err := db.First(&ws, "id = ?", mem.WorkspaceID).Error; err != nil {
			t.Fatalf("%s 应有工作台: %v", p, err)
		}
		if ws.OwnerID != u.ID {
			t.Errorf("%s 工作台 owner 不匹配", p)
		}
	}

	// 重复开通应冲突,且不吞成 500。
	if _, err := svc.AdminCreate(ctx, "13600000001", 0, ""); err == nil {
		t.Error("重复开通应返回冲突")
	} else if ae, ok := apperr.As(err); !ok || ae.Code != apperr.CodeConflict {
		t.Errorf("重复开通错误 = %v, 期望 CONFLICT", err)
	}
}
