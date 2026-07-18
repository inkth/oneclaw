package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
)

// MarketingService 处理落地页的公开表单:邮件订阅 + 预约演示 + 代理商注册。
type MarketingService struct {
	db  *gorm.DB
	sms *SMSService
}

func NewMarketingService(db *gorm.DB, sms *SMSService) *MarketingService {
	return &MarketingService{db: db, sms: sms}
}

// Subscribe 新增一条邮件订阅。email 已存在时返回 Conflict。
func (s *MarketingService) Subscribe(ctx context.Context, email string, source *string) (*model.NewsletterSubscription, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var existing model.NewsletterSubscription
	err := s.db.WithContext(ctx).Where("email = ?", email).First(&existing).Error
	if err == nil {
		return nil, apperr.Conflict("你已经订阅过了")
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询订阅失败", err)
	}

	sub := model.NewsletterSubscription{Email: email, Source: source}
	if err := s.db.WithContext(ctx).Create(&sub).Error; err != nil {
		// 并发下唯一索引兜底:仍按"已订阅"处理。
		return nil, apperr.Conflict("你已经订阅过了")
	}
	return &sub, nil
}

// CreateDemo 新增一条预约演示请求。
func (s *MarketingService) CreateDemo(ctx context.Context, in model.DemoRequest) (*model.DemoRequest, error) {
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if err := s.db.WithContext(ctx).Create(&in).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "提交预约失败", err)
	}
	return &in, nil
}

// SendPartnerCode 发送代理商注册专用短信验证码。
func (s *MarketingService) SendPartnerCode(ctx context.Context, phone string) (string, error) {
	return s.sms.sendForPurpose(ctx, strings.TrimSpace(phone), smsPurposePartnerRegistration)
}

// RegisterPartner 校验手机号后，用代理商名称和手机号登记注册申请。
// 同一手机号重复提交为幂等操作，更新名称但保留审核状态。
func (s *MarketingService) RegisterPartner(ctx context.Context, name, phone, code string) (*model.PartnerApplication, error) {
	name = strings.TrimSpace(name)
	phone = strings.TrimSpace(phone)
	if err := s.sms.verifyForPurpose(ctx, phone, strings.TrimSpace(code), smsPurposePartnerRegistration); err != nil {
		return nil, err
	}
	application := model.PartnerApplication{
		Name:   name,
		Phone:  phone,
		Status: model.PartnerPending,
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "phone"}},
		DoUpdates: clause.Assignments(map[string]any{
			"name":       name,
			"updated_at": time.Now(),
		}),
	}).Create(&application).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "代理商注册失败", err)
	}
	if err := s.db.WithContext(ctx).Where("phone = ?", phone).First(&application).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询代理商注册信息失败", err)
	}
	return &application, nil
}

// PartnerApplicationRow 申请行 + 该手机号在系统内的现状,供管理端判断审批后果:
// 无账号的申请通过时会一并建号。
type PartnerApplicationRow struct {
	Application model.PartnerApplication `json:"application"`
	HasUser     bool                     `json:"hasUser"`
	AgencyCode  string                   `json:"agencyCode,omitempty"`
}

// AdminListPartners 分页列出代理商申请。status="" 为全部。
func (s *MarketingService) AdminListPartners(ctx context.Context, status string, page int) ([]PartnerApplicationRow, int64, int, error) {
	if page < 1 {
		page = 1
	}
	q := s.db.WithContext(ctx).Model(&model.PartnerApplication{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, page, apperr.Wrap(apperr.CodeInternal, "统计代理商申请失败", err)
	}
	var items []model.PartnerApplication
	// 待审的排前面,同状态按申请时间倒序。
	if err := q.Order("CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at DESC").
		Limit(adminPageSize).Offset((page - 1) * adminPageSize).Find(&items).Error; err != nil {
		return nil, 0, page, apperr.Wrap(apperr.CodeInternal, "查询代理商申请失败", err)
	}
	if len(items) == 0 {
		return []PartnerApplicationRow{}, total, page, nil
	}

	// 批量补现状:手机号 -> 用户 -> 代理商邀请码。
	phones := make([]string, 0, len(items))
	for _, it := range items {
		phones = append(phones, it.Phone)
	}
	var users []model.User
	s.db.WithContext(ctx).Select("id", "phone").Where("phone IN ?", phones).Find(&users)
	userIDByPhone := make(map[string]uuid.UUID, len(users))
	ids := make([]uuid.UUID, 0, len(users))
	for _, u := range users {
		if u.Phone != nil {
			userIDByPhone[*u.Phone] = u.ID
			ids = append(ids, u.ID)
		}
	}
	codeByUser := map[uuid.UUID]string{}
	if len(ids) > 0 {
		var ags []model.Agency
		s.db.WithContext(ctx).Select("user_id", "code").Where("user_id IN ?", ids).Find(&ags)
		for _, a := range ags {
			codeByUser[a.UserID] = a.Code
		}
	}

	rows := make([]PartnerApplicationRow, 0, len(items))
	for _, it := range items {
		uid, ok := userIDByPhone[it.Phone]
		rows = append(rows, PartnerApplicationRow{
			Application: it,
			HasUser:     ok,
			AgencyCode:  codeByUser[uid],
		})
	}
	return rows, total, page, nil
}

// SetPartnerStatus 流转申请状态。审批动作本身在 AdminService 中编排。
func (s *MarketingService) SetPartnerStatus(ctx context.Context, id uuid.UUID, status string) (*model.PartnerApplication, error) {
	var app model.PartnerApplication
	if err := s.db.WithContext(ctx).First(&app, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperr.NotFound("申请不存在")
		}
		return nil, apperr.Wrap(apperr.CodeInternal, "查询代理商申请失败", err)
	}
	if err := s.db.WithContext(ctx).Model(&app).
		Updates(map[string]any{"status": status, "updated_at": time.Now()}).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "更新申请状态失败", err)
	}
	app.Status = status
	return &app, nil
}
