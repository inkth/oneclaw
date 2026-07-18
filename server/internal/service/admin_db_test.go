package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"os"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/model"
)

// 跑法(同 agency_db_test):
//   FAXIANMAO_TEST_DB_DSN="host=localhost port=5432 user=... dbname=faxianmao_admin_test sslmode=disable" \
//     go test ./internal/service/ -run TestAdmin -v
// 不设 DSN 则 skip(沙箱无 PG)。TestMain 由 discover_backfill_db_test.go 提供,同包不重复。

var adminTestTables = []any{
	&model.User{}, &model.Workspace{}, &model.Membership{},
	&model.PaymentOrder{}, &model.OverflowBill{}, &model.UsageRecord{},
	&model.Agency{}, &model.AgencyReferral{}, &model.CommissionRecord{},
	&model.AgencyWithdrawal{}, &model.BonusCreditGrant{}, &model.AdminAuditLog{},
}

func openAdminTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("FAXIANMAO_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("FAXIANMAO_TEST_DB_DSN 未设置,跳过 DB 集成测试")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接测试库失败: %v", err)
	}
	_ = db.Migrator().DropTable(adminTestTables...)
	if err := db.AutoMigrate(adminTestTables...); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	return db
}

func newAdminSvc(db *gorm.DB) *AdminService {
	agency := NewAgencyService(db, config.AgencyConfig{DefaultCommissionBP: 2000, BonusCredits: 300})
	quota := NewQuotaService(db)
	billing := NewBillingService(db, true, agency, true) // dev + 允许 mock 计佣
	return NewAdminService(db, billing, quota, agency)
}

func countAudit(t *testing.T, db *gorm.DB, action string) int64 {
	t.Helper()
	var n int64
	db.Model(&model.AdminAuditLog{}).Where("action = ?", action).Count(&n)
	return n
}

func TestAdminBanUnban(t *testing.T) {
	db := openAdminTestDB(t)
	admin := newAdminSvc(db)
	adminID := mkUser(t, db, "13900000001")
	target := mkUser(t, db, "13900000002")
	ctx := context.Background()

	// 不能封自己。
	if err := admin.BanUser(ctx, adminID, adminID, "self"); err == nil {
		t.Fatal("封禁自己应报错")
	}
	if err := admin.BanUser(ctx, adminID, target, "滥用"); err != nil {
		t.Fatalf("封禁失败: %v", err)
	}
	auth := NewAuthService(db, &config.Config{}, nil, nil)
	if !auth.IsBanned(ctx, target) {
		t.Fatal("封禁后 IsBanned 应为 true")
	}
	// 重复封禁应报错(幂等守卫)。
	if err := admin.BanUser(ctx, adminID, target, "again"); err == nil {
		t.Fatal("重复封禁应报错")
	}
	if err := admin.UnbanUser(ctx, adminID, target); err != nil {
		t.Fatalf("解封失败: %v", err)
	}
	if auth.IsBanned(ctx, target) {
		t.Fatal("解封后 IsBanned 应为 false")
	}
	if countAudit(t, db, model.AuditUserBan) != 1 || countAudit(t, db, model.AuditUserUnban) != 1 {
		t.Fatal("封禁/解封应各留一条审计")
	}
}

func TestAdminGrantCredits(t *testing.T) {
	db := openAdminTestDB(t)
	admin := newAdminSvc(db)
	adminID := mkUser(t, db, "13900000010")
	owner := mkUser(t, db, "13900000011")
	ws := mkWorkspace(t, db, owner, model.PlanFree)
	ctx := context.Background()

	if err := admin.GrantCredits(ctx, adminID, ws.ID, 500, "补偿"); err != nil {
		t.Fatalf("补积分失败: %v", err)
	}
	bonus := bonusCredits(ctx, db, ws.ID, time.Now())
	if bonus != 500 {
		t.Fatalf("赠送积分应抬高本周期上限 500,实得 %d", bonus)
	}
	// 非正数应拒绝。
	if err := admin.GrantCredits(ctx, adminID, ws.ID, 0, ""); err == nil {
		t.Fatal("补 0 积分应报错")
	}
	if countAudit(t, db, model.AuditGrantCredits) != 1 {
		t.Fatal("补积分应留一条审计")
	}
}

func TestAdminSetPlan(t *testing.T) {
	db := openAdminTestDB(t)
	admin := newAdminSvc(db)
	adminID := mkUser(t, db, "13900000020")
	owner := mkUser(t, db, "13900000021")
	ws := mkWorkspace(t, db, owner, model.PlanFree)
	ctx := context.Background()

	if err := admin.SetPlan(ctx, adminID, ws.ID, model.PlanPro, 3, "客服开通"); err != nil {
		t.Fatalf("改方案失败: %v", err)
	}
	var got model.Workspace
	db.First(&got, "id = ?", ws.ID)
	if got.Plan != model.PlanPro || got.PlanExpiresAt == nil || got.BillingCycleAnchor == nil {
		t.Fatalf("改方案后应为 PRO 且有到期/锚点,得 %+v", got)
	}
	if !got.PlanExpiresAt.After(time.Now().AddDate(0, 2, 20)) {
		t.Fatalf("3 个月有效期应约在 3 个月后,得 %v", got.PlanExpiresAt)
	}
	// 非法方案拒绝。
	if err := admin.SetPlan(ctx, adminID, ws.ID, "GOLD", 1, ""); err == nil {
		t.Fatal("非法方案应报错")
	}
	// 降回 FREE 清有效期。
	if err := admin.SetPlan(ctx, adminID, ws.ID, model.PlanFree, 0, "到期"); err != nil {
		t.Fatalf("降级失败: %v", err)
	}
	db.First(&got, "id = ?", ws.ID)
	if got.Plan != model.PlanFree || got.PlanExpiresAt != nil {
		t.Fatalf("降级后应为 FREE 且无到期,得 %+v", got)
	}
}

func TestAdminConfirmOrderCommission(t *testing.T) {
	db := openAdminTestDB(t)
	admin := newAdminSvc(db)
	adminID := mkUser(t, db, "13900000030")
	buyer := mkUser(t, db, "13900000031")
	ws := mkWorkspace(t, db, buyer, model.PlanFree)
	agUser := mkUser(t, db, "13900000032")
	ag := mkAgency(t, db, agUser, 2000, model.AgencyActive)
	// 买家归因绑定到代理。
	if err := db.Create(&model.AgencyReferral{UserID: buyer, AgencyID: ag.ID}).Error; err != nil {
		t.Fatalf("建归因失败: %v", err)
	}
	// 待支付真实订单(非 mock)。
	o := model.PaymentOrder{
		WorkspaceID: ws.ID, UserID: buyer, OutTradeNo: "OCTEST" + randomCode(6),
		Plan: model.PlanPro, PeriodMonths: 1, AmountCents: 19900,
		Provider: model.PayWechat, Status: model.OrderPending, IsMock: false,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := db.Create(&o).Error; err != nil {
		t.Fatalf("建订单失败: %v", err)
	}
	ctx := context.Background()

	got, err := admin.ConfirmOrder(ctx, adminID, o.ID)
	if err != nil {
		t.Fatalf("确认收款失败: %v", err)
	}
	if got.Status != model.OrderPaid {
		t.Fatalf("确认后订单应 PAID,得 %s", got.Status)
	}
	var upgraded model.Workspace
	db.First(&upgraded, "id = ?", ws.ID)
	if upgraded.Plan != model.PlanPro {
		t.Fatalf("确认后工作台应升级 PRO,得 %s", upgraded.Plan)
	}
	var comm model.CommissionRecord
	if err := db.Where("agency_id = ?", ag.ID).First(&comm).Error; err != nil {
		t.Fatalf("应生成佣金流水: %v", err)
	}
	if comm.AmountCents != model.CommissionCents(19900, 2000) {
		t.Fatalf("佣金应为 %d,得 %d", model.CommissionCents(19900, 2000), comm.AmountCents)
	}
	if countAudit(t, db, model.AuditOrderConfirm) != 1 {
		t.Fatal("确认收款应留一条审计")
	}

	// 退款:PAID → REFUNDED,并留审计。
	ref, err := admin.RefundOrder(ctx, adminID, o.ID, "客户申请")
	if err != nil {
		t.Fatalf("退款失败: %v", err)
	}
	if ref.Status != model.OrderRefunded {
		t.Fatalf("退款后应 REFUNDED,得 %s", ref.Status)
	}
	if countAudit(t, db, model.AuditOrderRefund) != 1 {
		t.Fatal("退款应留一条审计")
	}
}

func TestAdminDashboardRevenue(t *testing.T) {
	db := openAdminTestDB(t)
	admin := newAdminSvc(db)
	owner := mkUser(t, db, "13900000040")
	ws := mkWorkspace(t, db, owner, model.PlanFree)
	now := time.Now()
	// 两笔已支付订单 + 一笔待支付(不计收入)。
	mustCreate(t, db, &model.PaymentOrder{WorkspaceID: ws.ID, UserID: owner, OutTradeNo: "O1" + randomCode(6), Plan: model.PlanPro, PeriodMonths: 1, AmountCents: 19900, Provider: model.PayWechat, Status: model.OrderPaid, PaidAt: &now, ExpiresAt: now})
	mustCreate(t, db, &model.PaymentOrder{WorkspaceID: ws.ID, UserID: owner, OutTradeNo: "O2" + randomCode(6), Plan: model.PlanTeam, PeriodMonths: 1, AmountCents: 39900, Provider: model.PayAlipay, Status: model.OrderPaid, PaidAt: &now, ExpiresAt: now})
	mustCreate(t, db, &model.PaymentOrder{WorkspaceID: ws.ID, UserID: owner, OutTradeNo: "O3" + randomCode(6), Plan: model.PlanPro, PeriodMonths: 1, AmountCents: 19900, Provider: model.PayWechat, Status: model.OrderPending, ExpiresAt: now})

	d, err := admin.Dashboard(context.Background())
	if err != nil {
		t.Fatalf("看板失败: %v", err)
	}
	if d.RevenueTotalCents != 19900+39900 {
		t.Fatalf("累计收入应为 %d(仅 PAID),得 %d", 19900+39900, d.RevenueTotalCents)
	}
	if d.PaidOrderCount != 2 {
		t.Fatalf("已付款订单应 2,得 %d", d.PaidOrderCount)
	}
	if d.UserCount < 1 {
		t.Fatal("用户数应 ≥1")
	}
}

func mustCreate(t *testing.T, db *gorm.DB, v any) {
	t.Helper()
	if err := db.Create(v).Error; err != nil {
		t.Fatalf("建记录失败: %v", err)
	}
}

var _ = uuid.Nil
