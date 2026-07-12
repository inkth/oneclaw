package service

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
)

// MarketingService 处理落地页的公开表单:邮件订阅 + 预约演示。
type MarketingService struct {
	db *gorm.DB
}

func NewMarketingService(db *gorm.DB) *MarketingService {
	return &MarketingService{db: db}
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
