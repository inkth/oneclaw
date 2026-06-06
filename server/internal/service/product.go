package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
)

type ProductService struct {
	db *gorm.DB
}

func NewProductService(db *gorm.DB) *ProductService {
	return &ProductService{db: db}
}

type ProductInput struct {
	Title        string  `json:"title" binding:"required"`
	Category     string  `json:"category"`
	Emoji        *string `json:"emoji"`
	PriceCents   int     `json:"priceCents"`
	CostCents    int     `json:"costCents"`
	MarginPct    int     `json:"marginPct"`
	RoiScore     int     `json:"roiScore"`
	MonthlySales int     `json:"monthlySales"`
	TrendDelta   int     `json:"trendDelta"`
	Status       string  `json:"status"`
	Note         *string `json:"note"`
}

// ProductPatch 局部更新,nil 字段不改。
type ProductPatch struct {
	Title        *string `json:"title"`
	Category     *string `json:"category"`
	Emoji        *string `json:"emoji"`
	PriceCents   *int    `json:"priceCents"`
	CostCents    *int    `json:"costCents"`
	MarginPct    *int    `json:"marginPct"`
	RoiScore     *int    `json:"roiScore"`
	MonthlySales *int    `json:"monthlySales"`
	TrendDelta   *int    `json:"trendDelta"`
	Status       *string `json:"status"`
	Note         *string `json:"note"`
}

func (s *ProductService) List(ctx context.Context, wsID uuid.UUID) ([]model.Product, error) {
	var items []model.Product
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("created_at DESC").
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询商品失败", err)
	}
	return items, nil
}

func (s *ProductService) Create(ctx context.Context, wsID uuid.UUID, in ProductInput) (*model.Product, error) {
	status := in.Status
	if status == "" {
		status = model.ProductEvaluating
	}
	p := model.Product{
		WorkspaceID:  wsID,
		Title:        in.Title,
		Category:     in.Category,
		Emoji:        in.Emoji,
		PriceCents:   in.PriceCents,
		CostCents:    in.CostCents,
		MarginPct:    in.MarginPct,
		RoiScore:     in.RoiScore,
		MonthlySales: in.MonthlySales,
		TrendDelta:   in.TrendDelta,
		Status:       status,
		Note:         in.Note,
	}
	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建商品失败", err)
	}
	return &p, nil
}

func (s *ProductService) get(ctx context.Context, wsID, pid uuid.UUID) (*model.Product, error) {
	var p model.Product
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", pid, wsID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("商品不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询商品失败", err)
	}
	return &p, nil
}

func (s *ProductService) Update(ctx context.Context, wsID, pid uuid.UUID, patch ProductPatch) (*model.Product, error) {
	p, err := s.get(ctx, wsID, pid)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if patch.Title != nil {
		updates["title"] = *patch.Title
	}
	if patch.Category != nil {
		updates["category"] = *patch.Category
	}
	if patch.Emoji != nil {
		updates["emoji"] = *patch.Emoji
	}
	if patch.PriceCents != nil {
		updates["price_cents"] = *patch.PriceCents
	}
	if patch.CostCents != nil {
		updates["cost_cents"] = *patch.CostCents
	}
	if patch.MarginPct != nil {
		updates["margin_pct"] = *patch.MarginPct
	}
	if patch.RoiScore != nil {
		updates["roi_score"] = *patch.RoiScore
	}
	if patch.MonthlySales != nil {
		updates["monthly_sales"] = *patch.MonthlySales
	}
	if patch.TrendDelta != nil {
		updates["trend_delta"] = *patch.TrendDelta
	}
	if patch.Status != nil {
		updates["status"] = *patch.Status
	}
	if patch.Note != nil {
		updates["note"] = *patch.Note
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(p).Updates(updates).Error; err != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "更新商品失败", err)
		}
	}
	return s.get(ctx, wsID, pid)
}

func (s *ProductService) Delete(ctx context.Context, wsID, pid uuid.UUID) error {
	res := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", pid, wsID).Delete(&model.Product{})
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "删除商品失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return apperr.NotFound("商品不存在")
	}
	return nil
}
