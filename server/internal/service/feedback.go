package service

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
)

// FeedbackService 站内用户反馈:登录用户提交,管理后台只读查看。
// 刻意不做状态流转/站内回复——早期反馈量撑不起工单系统,回访走手机号人肉处理。
type FeedbackService struct {
	db *gorm.DB
}

func NewFeedbackService(db *gorm.DB) *FeedbackService {
	return &FeedbackService{db: db}
}

// Create 新增一条反馈。
func (s *FeedbackService) Create(ctx context.Context, in model.Feedback) (*model.Feedback, error) {
	if err := s.db.WithContext(ctx).Create(&in).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "提交反馈失败", err)
	}
	return &in, nil
}

type FeedbackRow struct {
	Feedback  model.Feedback `json:"feedback"`
	UserPhone string         `json:"userPhone"`
}

// AdminList 反馈分页(typ 空=全部;新在前)。附提交人手机号。
func (s *FeedbackService) AdminList(ctx context.Context, typ string, page int) ([]FeedbackRow, int64, int, error) {
	if page < 1 {
		page = 1
	}
	q := s.db.WithContext(ctx).Model(&model.Feedback{})
	if typ != "" {
		q = q.Where("type = ?", typ)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, page, apperr.Wrap(apperr.CodeInternal, "统计反馈失败", err)
	}
	var items []model.Feedback
	if err := q.Order("created_at DESC").
		Limit(adminPageSize).Offset((page - 1) * adminPageSize).Find(&items).Error; err != nil {
		return nil, 0, page, apperr.Wrap(apperr.CodeInternal, "查询反馈失败", err)
	}
	// 补提交人手机号(小页,逐行查可接受;同人多条走缓存)。
	phones := map[uuid.UUID]string{}
	rows := make([]FeedbackRow, 0, len(items))
	for _, f := range items {
		phone, ok := phones[f.UserID]
		if !ok {
			var u model.User
			if s.db.WithContext(ctx).Select("phone").First(&u, "id = ?", f.UserID).Error == nil && u.Phone != nil {
				phone = *u.Phone
			}
			phones[f.UserID] = phone
		}
		rows = append(rows, FeedbackRow{Feedback: f, UserPhone: phone})
	}
	return rows, total, page, nil
}
