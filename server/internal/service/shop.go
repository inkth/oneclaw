package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
)

type ShopService struct {
	db *gorm.DB
}

func NewShopService(db *gorm.DB) *ShopService {
	return &ShopService{db: db}
}

type ShopInput struct {
	Name       string  `json:"name" binding:"required,max=80"`
	Platform   string  `json:"platform" binding:"required,oneof=TIKTOK_SHOP AMAZON SHOPIFY LAZADA SHOPEE TEMU OTHER"`
	Country    *string `json:"country" binding:"omitempty,min=2,max=8"`
	ExternalID *string `json:"externalId" binding:"omitempty,max=120"`
}

type ShopPatch struct {
	Name    *string `json:"name"`
	Status  *string `json:"status" binding:"omitempty,oneof=CONNECTED PENDING DISCONNECTED ERROR"`
	Country *string `json:"country"`
}

// ShopRow 在 Shop 之上附带关联商品数(对齐原 Next 的 _count.products → productCount)。
type ShopRow struct {
	model.Shop
	ProductCount int `json:"productCount"`
}

type ShopTotals struct {
	RevenueCents int `json:"revenueCents"`
	Orders       int `json:"orders"`
	ItemsSold    int `json:"itemsSold"`
	Visitors     int `json:"visitors"`
}

func (s *ShopService) List(ctx context.Context, wsID uuid.UUID) ([]ShopRow, ShopTotals, error) {
	var shops []model.Shop
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("status ASC").
		Order("created_at DESC").
		Find(&shops).Error; err != nil {
		return nil, ShopTotals{}, apperr.Wrap(apperr.CodeInternal, "查询店铺失败", err)
	}

	// 每店关联商品数
	type shopCount struct {
		ShopID uuid.UUID `gorm:"column:shop_id"`
		N      int       `gorm:"column:n"`
	}
	var counts []shopCount
	if err := s.db.WithContext(ctx).
		Model(&model.Product{}).
		Select("shop_id, count(*) as n").
		Where("workspace_id = ? AND shop_id IS NOT NULL", wsID).
		Group("shop_id").
		Scan(&counts).Error; err != nil {
		return nil, ShopTotals{}, apperr.Wrap(apperr.CodeInternal, "统计店铺商品数失败", err)
	}
	countByShop := make(map[uuid.UUID]int, len(counts))
	for _, c := range counts {
		countByShop[c.ShopID] = c.N
	}

	rows := make([]ShopRow, 0, len(shops))
	var totals ShopTotals
	for _, sh := range shops {
		rows = append(rows, ShopRow{Shop: sh, ProductCount: countByShop[sh.ID]})
		totals.RevenueCents += sh.TotalRevenueCents
		totals.Orders += sh.Orders
		totals.ItemsSold += sh.ItemsSold
		totals.Visitors += sh.Visitors
	}
	return rows, totals, nil
}

func (s *ShopService) Create(ctx context.Context, wsID uuid.UUID, in ShopInput) (*model.Shop, error) {
	sh := model.Shop{
		WorkspaceID: wsID,
		Name:        in.Name,
		Platform:    in.Platform,
		Country:     in.Country,
		ExternalID:  in.ExternalID,
		Status:      model.ShopStatusPending, // 平台对接前先 PENDING
	}
	if err := s.db.WithContext(ctx).Create(&sh).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建店铺失败", err)
	}
	return &sh, nil
}

func (s *ShopService) Update(ctx context.Context, wsID, sid uuid.UUID, patch ShopPatch) (*model.Shop, error) {
	sh, err := s.get(ctx, wsID, sid)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if patch.Name != nil {
		updates["name"] = *patch.Name
	}
	if patch.Status != nil {
		updates["status"] = *patch.Status
	}
	if patch.Country != nil {
		updates["country"] = *patch.Country
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(sh).Updates(updates).Error; err != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "更新店铺失败", err)
		}
	}
	return s.get(ctx, wsID, sid)
}

func (s *ShopService) Delete(ctx context.Context, wsID, sid uuid.UUID) error {
	res := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", sid, wsID).Delete(&model.Shop{})
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "删除店铺失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return apperr.NotFound("店铺不存在")
	}
	return nil
}

func (s *ShopService) get(ctx context.Context, wsID, sid uuid.UUID) (*model.Shop, error) {
	var sh model.Shop
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", sid, wsID).First(&sh).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("店铺不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询店铺失败", err)
	}
	return &sh, nil
}
