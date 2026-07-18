package service

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/config"
	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

// AgencyService 代理商系统:归因绑定 + 佣金记账 + 提现 + 管理侧开通/审核。
// 归因绑定在 User 上(注册主体是人);佣金按落账时比例快照,调比例不重算历史。
type AgencyService struct {
	db  *gorm.DB
	cfg config.AgencyConfig
}

func NewAgencyService(db *gorm.DB, cfg config.AgencyConfig) *AgencyService {
	if cfg.DefaultCommissionBP <= 0 {
		cfg.DefaultCommissionBP = model.DefaultCommissionBP
	}
	if cfg.ReferralTTLDays <= 0 {
		cfg.ReferralTTLDays = 30
	}
	return &AgencyService{db: db, cfg: cfg}
}

// codeAlphabet 邀请码字符集:去掉易混字符(0/O、1/I/L),8 位随机。
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func randomCode(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	out := make([]byte, n)
	for i := range b {
		out[i] = codeAlphabet[int(b[i])%len(codeAlphabet)]
	}
	return string(out)
}

// maskPhone 手机号脱敏:138****0000。非 11 位时保留后 4 位打码。
func maskPhone(p string) string {
	switch {
	case len(p) == 11:
		return p[:3] + "****" + p[7:]
	case len(p) > 4:
		return p[:len(p)-4] + "****"
	default:
		return "****"
	}
}

// —— 归因绑定 & 计佣(事务内原语,供 auth / billing 挂钩) ———————————————————

// BindReferralTx 在既有事务 tx 内为新注册用户绑定推荐代理商并发放赠送积分。
// inviteCode 无效 / 代理停用 / 用户已绑定 → 静默返回 nil,绝不阻断注册主流程。
func (s *AgencyService) BindReferralTx(tx *gorm.DB, userID, wsID uuid.UUID, inviteCode string, now time.Time) error {
	return s.bindTrackedReferralTx(tx, userID, wsID, inviteCode, "", now)
}

// BindTrackedReferralTx 优先使用服务端签名 Cookie 固化首触点击；inviteCode 仅作旧链接兼容。
func (s *AgencyService) BindTrackedReferralTx(tx *gorm.DB, userID, wsID uuid.UUID, inviteCode, referralToken string, now time.Time) error {
	return s.bindTrackedReferralTx(tx, userID, wsID, inviteCode, referralToken, now)
}

func (s *AgencyService) bindTrackedReferralTx(tx *gorm.DB, userID, wsID uuid.UUID, inviteCode, referralToken string, now time.Time) error {
	code := normalizeAgencyCode(inviteCode)
	var clickID *uuid.UUID
	source := model.ReferralSourceLegacy
	var ag *model.Agency

	if claims, err := parseAgencyReferralToken(s.cfg.ReferralSecret, referralToken); err == nil {
		agencyID, agencyErr := uuid.Parse(claims.AgencyID)
		parsedClickID, clickErr := uuid.Parse(claims.ClickID)
		if agencyErr == nil && clickErr == nil {
			var signedAgency model.Agency
			if err := tx.Where("id = ? AND code = ? AND status = ?", agencyID, claims.InviteCode, model.AgencyActive).
				First(&signedAgency).Error; err == nil {
				ag = &signedAgency
				code = claims.InviteCode
				clickID = &parsedClickID
				source = model.ReferralSourceLink
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
	}
	if code == "" {
		return nil
	}
	if ag == nil {
		resolved, err := s.findActiveAgencyByCode(tx, code)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil // 无效码 / 已停用:忽略
			}
			return err
		}
		ag = resolved
	}
	if ag == nil {
		return nil
	}
	return s.bindReferralToAgencyTx(tx, userID, wsID, *ag, code, clickID, source, now)
}

func (s *AgencyService) findActiveAgencyByCode(db *gorm.DB, code string) (*model.Agency, error) {
	var ag model.Agency
	if err := db.Where("code = ? AND status = ?", code, model.AgencyActive).First(&ag).Error; err != nil {
		return nil, err
	}
	return &ag, nil
}

func (s *AgencyService) bindReferralToAgencyTx(tx *gorm.DB, userID, wsID uuid.UUID, ag model.Agency, code string, clickID *uuid.UUID, source string, now time.Time) error {
	if ag.Status != model.AgencyActive {
		return nil
	}
	if ag.UserID == userID {
		return nil
	}
	if code == "" {
		return nil
	}
	if ag.ID == uuid.Nil {
		return nil
	}
	// 代理商用自己的码注册新号无意义,但新用户 ID 必然不等于代理 user_id,无需额外判重。
	bonus := s.cfg.BonusCredits
	eligibleUntil := now.AddDate(1, 0, 0)
	ref := model.AgencyReferral{
		UserID:                  userID,
		AgencyID:                ag.ID,
		ClickID:                 clickID,
		AttributionSource:       source,
		BonusCredits:            bonus,
		CommissionEligibleUntil: &eligibleUntil,
		CreatedAt:               now,
	}
	// user_id 唯一;防御性 DoNothing:极端重放不重复绑。
	res := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&ref)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return nil // 已绑定过
	}
	if clickID != nil {
		if err := tx.Model(&model.AgencyReferralClick{}).
			Where("id = ? AND agency_id = ?", *clickID, ag.ID).
			Updates(map[string]any{"converted_user_id": userID, "converted_at": now}).Error; err != nil {
			return err
		}
	}
	if bonus > 0 {
		_, end := cycleBounds(now, now) // 首个订阅周期末:新人首周期内额度 +bonus
		grant := model.BonusCreditGrant{
			WorkspaceID: wsID,
			UserID:      userID,
			Credits:     bonus,
			Source:      model.BonusSourceAgencyInvite,
			RefID:       &ref.ID,
			ExpiresAt:   end,
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&grant).Error; err != nil {
			return err
		}
	}
	logger.Info("[agency] 归因绑定成功",
		logger.String("user", userID.String()), logger.String("agency", ag.ID.String()),
		logger.String("code", code), logger.Int("bonus", bonus))
	return nil
}

// RecordCommissionTx 在既有事务 tx 内为一笔真实付费计佣(幂等:source 唯一冲突即空转)。
// 找不到归因 / 超出注册后一年 / 代理停用 → 静默返回 nil,不影响主支付流程。
func (s *AgencyService) RecordCommissionTx(tx *gorm.DB, sourceType string, sourceID, payerUserID uuid.UUID, baseCents int, paidAt time.Time) error {
	var ref model.AgencyReferral
	if err := tx.Where("user_id = ?", payerUserID).First(&ref).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil // 无归因,不计佣
		}
		return err
	}
	if !ref.CommissionEligibleAt(paidAt) {
		return nil
	}
	var ag model.Agency
	if err := tx.First(&ag, "id = ?", ref.AgencyID).Error; err != nil {
		return err
	}
	if ag.Status != model.AgencyActive {
		return nil // 代理停用,停止对新付费计佣
	}
	rec := model.CommissionRecord{
		AgencyID:        ag.ID,
		UserID:          payerUserID,
		SourceType:      sourceType,
		SourceID:        sourceID,
		BaseAmountCents: baseCents,
		CommissionBP:    ag.CommissionBP,
		AmountCents:     model.CommissionCents(baseCents, ag.CommissionBP),
	}
	// (source_type, source_id) 唯一 + DoNothing:重复计佣空转(幂等兜底)。
	res := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&rec)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		logger.Info("[agency] 计佣",
			logger.String("agency", ag.ID.String()), logger.String("source", sourceType),
			logger.Int("base", baseCents), logger.Int("amount", rec.AmountCents))
	}
	return nil
}

// balanceCents 代理商可提现余额 = SUM(佣金) − SUM(提现 status IN PENDING/PAID)。db 可传事务。
func (s *AgencyService) balanceCents(ctx context.Context, db *gorm.DB, agencyID uuid.UUID) int {
	var earned int64
	db.WithContext(ctx).Model(&model.CommissionRecord{}).
		Where("agency_id = ?", agencyID).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&earned)
	var reserved int64
	db.WithContext(ctx).Model(&model.AgencyWithdrawal{}).
		Where("agency_id = ? AND status IN ?", agencyID, []string{model.WithdrawalPending, model.WithdrawalPaid}).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&reserved)
	return int(earned - reserved)
}

// —— 代理侧读取 ————————————————————————————————————————————————

// GetByUser 取用户的代理身份;非代理返回 (nil, nil)。
func (s *AgencyService) GetByUser(ctx context.Context, userID uuid.UUID) (*model.Agency, error) {
	var ag model.Agency
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&ag).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "查询代理身份失败", err)
	}
	return &ag, nil
}

// requireAgency 取用户代理身份;非代理返回 Forbidden。
func (s *AgencyService) requireAgency(ctx context.Context, userID uuid.UUID) (*model.Agency, error) {
	ag, err := s.GetByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if ag == nil {
		return nil, apperr.Forbidden("你还不是代理商")
	}
	return ag, nil
}

// AgencySummary 代理面板概览。
type AgencySummary struct {
	Code                   string `json:"code"`
	Status                 string `json:"status"`
	CommissionBP           int    `json:"commissionBp"`
	ClickCount             int    `json:"clickCount"`
	SignupRate             int    `json:"signupRate"`
	CustomerCount          int    `json:"customerCount"`
	TotalPaidCents         int    `json:"totalPaidCents"`         // 客户累计付费(计佣基数)
	TotalCommissionCents   int    `json:"totalCommissionCents"`   // 累计佣金
	BalanceCents           int    `json:"balanceCents"`           // 可提现余额
	PendingWithdrawalCents int    `json:"pendingWithdrawalCents"` // 审核中提现占用
}

func (s *AgencyService) Summary(ctx context.Context, userID uuid.UUID) (*AgencySummary, error) {
	ag, err := s.requireAgency(ctx, userID)
	if err != nil {
		return nil, err
	}
	var customerCount int64
	s.db.WithContext(ctx).Model(&model.AgencyReferral{}).Where("agency_id = ?", ag.ID).Count(&customerCount)
	var trackedCustomerCount int64
	s.db.WithContext(ctx).Model(&model.AgencyReferral{}).
		Where("agency_id = ? AND click_id IS NOT NULL", ag.ID).Count(&trackedCustomerCount)
	var clickCount int64
	s.db.WithContext(ctx).Model(&model.AgencyReferralClick{}).Where("agency_id = ?", ag.ID).Count(&clickCount)
	var totalPaid, totalCommission int64
	s.db.WithContext(ctx).Model(&model.CommissionRecord{}).Where("agency_id = ?", ag.ID).
		Select("COALESCE(SUM(base_amount_cents),0)").Scan(&totalPaid)
	s.db.WithContext(ctx).Model(&model.CommissionRecord{}).Where("agency_id = ?", ag.ID).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&totalCommission)
	var pending int64
	s.db.WithContext(ctx).Model(&model.AgencyWithdrawal{}).
		Where("agency_id = ? AND status = ?", ag.ID, model.WithdrawalPending).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&pending)
	signupRate := 0
	if clickCount > 0 {
		signupRate = int(trackedCustomerCount * 100 / clickCount)
	}
	return &AgencySummary{
		Code:                   ag.Code,
		Status:                 ag.Status,
		CommissionBP:           ag.CommissionBP,
		ClickCount:             int(clickCount),
		SignupRate:             signupRate,
		CustomerCount:          int(customerCount),
		TotalPaidCents:         int(totalPaid),
		TotalCommissionCents:   int(totalCommission),
		BalanceCents:           s.balanceCents(ctx, s.db, ag.ID),
		PendingWithdrawalCents: int(pending),
	}, nil
}

// AgencyCustomer 客户列表行(脱敏)。
type AgencyCustomer struct {
	Phone           string    `json:"phone"` // 脱敏
	BoundAt         time.Time `json:"boundAt"`
	PaidCents       int       `json:"paidCents"`       // 该客户累计付费
	CommissionCents int       `json:"commissionCents"` // 该客户带来的累计佣金
}

func (s *AgencyService) ListCustomers(ctx context.Context, userID uuid.UUID) ([]AgencyCustomer, error) {
	ag, err := s.requireAgency(ctx, userID)
	if err != nil {
		return nil, err
	}
	var refs []model.AgencyReferral
	if err := s.db.WithContext(ctx).Where("agency_id = ?", ag.ID).
		Order("created_at DESC").Find(&refs).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询客户失败", err)
	}
	out := make([]AgencyCustomer, 0, len(refs))
	for _, r := range refs {
		phone := ""
		var u model.User
		if s.db.WithContext(ctx).Select("phone").First(&u, "id = ?", r.UserID).Error == nil && u.Phone != nil {
			phone = maskPhone(*u.Phone)
		}
		var paid, commission int64
		s.db.WithContext(ctx).Model(&model.CommissionRecord{}).
			Where("agency_id = ? AND user_id = ?", ag.ID, r.UserID).
			Select("COALESCE(SUM(base_amount_cents),0)").Scan(&paid)
		s.db.WithContext(ctx).Model(&model.CommissionRecord{}).
			Where("agency_id = ? AND user_id = ?", ag.ID, r.UserID).
			Select("COALESCE(SUM(amount_cents),0)").Scan(&commission)
		out = append(out, AgencyCustomer{
			Phone:           phone,
			BoundAt:         r.CreatedAt,
			PaidCents:       int(paid),
			CommissionCents: int(commission),
		})
	}
	return out, nil
}

func (s *AgencyService) ListCommissions(ctx context.Context, userID uuid.UUID) ([]model.CommissionRecord, error) {
	ag, err := s.requireAgency(ctx, userID)
	if err != nil {
		return nil, err
	}
	var recs []model.CommissionRecord
	if err := s.db.WithContext(ctx).Where("agency_id = ?", ag.ID).
		Order("created_at DESC").Limit(200).Find(&recs).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询佣金流水失败", err)
	}
	return recs, nil
}

func (s *AgencyService) ListWithdrawals(ctx context.Context, userID uuid.UUID) ([]model.AgencyWithdrawal, error) {
	ag, err := s.requireAgency(ctx, userID)
	if err != nil {
		return nil, err
	}
	var ws []model.AgencyWithdrawal
	if err := s.db.WithContext(ctx).Where("agency_id = ?", ag.ID).
		Order("created_at DESC").Find(&ws).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询提现记录失败", err)
	}
	return ws, nil
}

// RequestWithdrawal 发起提现。锁代理行防并发双花,校验金额 ≤ 可提现余额。
func (s *AgencyService) RequestWithdrawal(ctx context.Context, userID uuid.UUID, amountCents int, note string) (*model.AgencyWithdrawal, error) {
	ag, err := s.requireAgency(ctx, userID)
	if err != nil {
		return nil, err
	}
	if amountCents <= 0 {
		return nil, apperr.BadRequest("提现金额需大于 0")
	}
	var w model.AgencyWithdrawal
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 锁代理行:序列化同一代理的并发提现申请,余额判定期间不被其他申请穿插。
		var locked model.Agency
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, "id = ?", ag.ID).Error; e != nil {
			return apperr.Wrap(apperr.CodeInternal, "锁定代理失败", e)
		}
		bal := s.balanceCents(ctx, tx, ag.ID)
		if amountCents > bal {
			return apperr.BadRequest("提现金额超过可提现余额")
		}
		w = model.AgencyWithdrawal{
			AgencyID:    ag.ID,
			AmountCents: amountCents,
			Status:      model.WithdrawalPending,
			Note:        note,
		}
		if e := tx.Create(&w).Error; e != nil {
			return apperr.Wrap(apperr.CodeInternal, "创建提现申请失败", e)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	logger.Info("[agency] 提现申请", logger.String("agency", ag.ID.String()), logger.Int("amount", amountCents))
	return &w, nil
}

// —— 管理侧 ————————————————————————————————————————————————————

// AgencyAdminRow 管理端代理列表行(含代理商手机号与聚合业绩)。
type AgencyAdminRow struct {
	Agency               model.Agency `json:"agency"`
	Phone                string       `json:"phone"` // 代理商本人手机号(明文,管理端可见)
	CustomerCount        int          `json:"customerCount"`
	TotalCommissionCents int          `json:"totalCommissionCents"`
	BalanceCents         int          `json:"balanceCents"`
}

func (s *AgencyService) AdminList(ctx context.Context) ([]AgencyAdminRow, error) {
	var ags []model.Agency
	if err := s.db.WithContext(ctx).Order("created_at DESC").Find(&ags).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询代理列表失败", err)
	}
	out := make([]AgencyAdminRow, 0, len(ags))
	for _, ag := range ags {
		phone := ""
		var u model.User
		if s.db.WithContext(ctx).Select("phone").First(&u, "id = ?", ag.UserID).Error == nil && u.Phone != nil {
			phone = *u.Phone
		}
		var cnt int64
		s.db.WithContext(ctx).Model(&model.AgencyReferral{}).Where("agency_id = ?", ag.ID).Count(&cnt)
		var commission int64
		s.db.WithContext(ctx).Model(&model.CommissionRecord{}).Where("agency_id = ?", ag.ID).
			Select("COALESCE(SUM(amount_cents),0)").Scan(&commission)
		out = append(out, AgencyAdminRow{
			Agency:               ag,
			Phone:                phone,
			CustomerCount:        int(cnt),
			TotalCommissionCents: int(commission),
			BalanceCents:         s.balanceCents(ctx, s.db, ag.ID),
		})
	}
	return out, nil
}

// AdminCreate 按手机号开通代理商。手机号尚无账号时一并建号(含默认工作台),
// 因为代理商多为线下谈成、从未登录过产品;已是代理返回冲突。commissionBP<=0 用默认。
func (s *AgencyService) AdminCreate(ctx context.Context, phone string, commissionBP int, note string) (*model.Agency, error) {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return nil, apperr.BadRequest("手机号不能为空")
	}
	if commissionBP <= 0 {
		commissionBP = s.cfg.DefaultCommissionBP
	}
	var ag model.Agency
	var created bool
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		e := tx.Where("phone = ?", phone).First(&u).Error
		if errors.Is(e, gorm.ErrRecordNotFound) {
			// 建号口径与 LoginByCode 保持一致:工作台与 OWNER membership 必须成对,
			// 否则 GetDefault 的兜底会再建一个工作台。
			phoneVal := phone
			now := time.Now()
			name := defaultUserName
			u = model.User{Phone: &phoneVal, PhoneVerified: &now, Name: &name}
			if e := tx.Create(&u).Error; e != nil {
				return e
			}
			if _, e := createDefaultForUser(tx, u.ID, ""); e != nil {
				return e
			}
			created = true
		} else if e != nil {
			return e
		}
		var existing model.Agency
		if e := tx.Where("user_id = ?", u.ID).First(&existing).Error; e == nil {
			return apperr.Conflict("该用户已是代理商")
		}
		ag = model.Agency{
			UserID:       u.ID,
			CommissionBP: commissionBP,
			Status:       model.AgencyActive,
			Note:         note,
		}
		// 四位数字邀请码由数据库 sequence 从 1112 开始并发安全分配。
		code, e := nextInviteCode(tx)
		if e != nil {
			return e
		}
		ag.Code = code
		return tx.Create(&ag).Error
	})
	if err != nil {
		if ae, ok := apperr.As(err); ok {
			return nil, ae
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "开通代理失败", err)
	}
	logger.Info("[agency] 开通代理",
		logger.String("user", ag.UserID.String()),
		logger.String("code", ag.Code),
		logger.Bool("newUser", created))
	return &ag, nil
}

// AdminUpdate 调整佣金比例 / 状态。bp<=0 表示不改;status="" 表示不改。
func (s *AgencyService) AdminUpdate(ctx context.Context, agencyID uuid.UUID, commissionBP int, status string) (*model.Agency, error) {
	updates := map[string]any{}
	if commissionBP > 0 {
		updates["commission_bp"] = commissionBP
	}
	if status != "" {
		if status != model.AgencyActive && status != model.AgencyDisabled {
			return nil, apperr.BadRequest("状态非法")
		}
		updates["status"] = status
	}
	if len(updates) == 0 {
		return nil, apperr.BadRequest("无可更新字段")
	}
	res := s.db.WithContext(ctx).Model(&model.Agency{}).Where("id = ?", agencyID).Updates(updates)
	if res.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "更新代理失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperr.NotFound("代理不存在")
	}
	var ag model.Agency
	if err := s.db.WithContext(ctx).First(&ag, "id = ?", agencyID).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询代理失败", err)
	}
	return &ag, nil
}

// WithdrawalAdminRow 管理端提现行(含代理商手机号)。
type WithdrawalAdminRow struct {
	Withdrawal model.AgencyWithdrawal `json:"withdrawal"`
	Phone      string                 `json:"phone"`
}

// AdminListWithdrawals 列出提现申请。status 空=全部;PENDING 恒在前(待审优先)。
func (s *AgencyService) AdminListWithdrawals(ctx context.Context, status string) ([]WithdrawalAdminRow, error) {
	q := s.db.WithContext(ctx).Model(&model.AgencyWithdrawal{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var ws []model.AgencyWithdrawal
	// PENDING(待审)排最前,再按申请时间倒序。
	if err := q.Order("CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at DESC").Find(&ws).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询提现申请失败", err)
	}
	out := make([]WithdrawalAdminRow, 0, len(ws))
	for _, w := range ws {
		phone := ""
		var ag model.Agency
		if s.db.WithContext(ctx).Select("user_id").First(&ag, "id = ?", w.AgencyID).Error == nil {
			var u model.User
			if s.db.WithContext(ctx).Select("phone").First(&u, "id = ?", ag.UserID).Error == nil && u.Phone != nil {
				phone = *u.Phone
			}
		}
		out = append(out, WithdrawalAdminRow{Withdrawal: w, Phone: phone})
	}
	return out, nil
}

// AdminReviewWithdrawal 审核提现:approve=true→PAID(线下已打款),false→REJECTED(释放余额)。
// 幂等:仅 PENDING 单生效。
func (s *AgencyService) AdminReviewWithdrawal(ctx context.Context, withdrawalID, reviewerID uuid.UUID, approve bool, note string) (*model.AgencyWithdrawal, error) {
	now := time.Now()
	status := model.WithdrawalRejected
	if approve {
		status = model.WithdrawalPaid
	}
	res := s.db.WithContext(ctx).Model(&model.AgencyWithdrawal{}).
		Where("id = ? AND status = ?", withdrawalID, model.WithdrawalPending).
		Updates(map[string]any{"status": status, "note": note, "reviewed_by": reviewerID, "reviewed_at": now})
	if res.Error != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "审核提现失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, apperr.BadRequest("提现申请不存在或已处理")
	}
	var w model.AgencyWithdrawal
	if err := s.db.WithContext(ctx).First(&w, "id = ?", withdrawalID).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询提现失败", err)
	}
	logger.Info("[agency] 提现审核", logger.String("id", withdrawalID.String()), logger.String("status", status))
	return &w, nil
}

// AgencyOverview 管理端总览。
type AgencyOverview struct {
	AgencyCount            int `json:"agencyCount"`
	ActiveAgencyCount      int `json:"activeAgencyCount"`
	ReferredUserCount      int `json:"referredUserCount"`
	TotalCommissionCents   int `json:"totalCommissionCents"`
	PendingWithdrawalCount int `json:"pendingWithdrawalCount"`
	PendingWithdrawalCents int `json:"pendingWithdrawalCents"`
}

func (s *AgencyService) AdminOverview(ctx context.Context) (*AgencyOverview, error) {
	var o AgencyOverview
	var n int64
	s.db.WithContext(ctx).Model(&model.Agency{}).Count(&n)
	o.AgencyCount = int(n)
	s.db.WithContext(ctx).Model(&model.Agency{}).Where("status = ?", model.AgencyActive).Count(&n)
	o.ActiveAgencyCount = int(n)
	s.db.WithContext(ctx).Model(&model.AgencyReferral{}).Count(&n)
	o.ReferredUserCount = int(n)
	var commission int64
	s.db.WithContext(ctx).Model(&model.CommissionRecord{}).Select("COALESCE(SUM(amount_cents),0)").Scan(&commission)
	o.TotalCommissionCents = int(commission)
	s.db.WithContext(ctx).Model(&model.AgencyWithdrawal{}).Where("status = ?", model.WithdrawalPending).Count(&n)
	o.PendingWithdrawalCount = int(n)
	var pending int64
	s.db.WithContext(ctx).Model(&model.AgencyWithdrawal{}).Where("status = ?", model.WithdrawalPending).
		Select("COALESCE(SUM(amount_cents),0)").Scan(&pending)
	o.PendingWithdrawalCents = int(pending)
	return &o, nil
}
