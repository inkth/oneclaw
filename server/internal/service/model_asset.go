package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
)

type ModelAssetService struct {
	db *gorm.DB
}

func NewModelAssetService(db *gorm.DB) *ModelAssetService {
	return &ModelAssetService{db: db}
}

type ModelInput struct {
	Name        string  `json:"name" binding:"required,max=80"`
	Kind        string  `json:"kind" binding:"omitempty,oneof=DIGITAL_HUMAN REAL_PERSON"`
	Gender      string  `json:"gender" binding:"omitempty,oneof=FEMALE MALE NEUTRAL"`
	Style       *string `json:"style" binding:"omitempty,max=80"`
	Description *string `json:"description" binding:"omitempty,max=800"`
	AvatarURL   *string `json:"avatarUrl" binding:"omitempty,url"`
}

type ModelPatch struct {
	Name        *string `json:"name"`
	Style       *string `json:"style"`
	Description *string `json:"description"`
	IsFavorite  *bool   `json:"isFavorite"`
}

func (s *ModelAssetService) List(ctx context.Context, wsID uuid.UUID) ([]model.ModelAsset, error) {
	var items []model.ModelAsset
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("is_favorite DESC").
		Order("created_at DESC").
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询模特失败", err)
	}
	return items, nil
}

func (s *ModelAssetService) Create(ctx context.Context, wsID uuid.UUID, in ModelInput) (*model.ModelAsset, error) {
	kind := in.Kind
	if kind == "" {
		kind = model.ModelKindDigitalHuman
	}
	gender := in.Gender
	if gender == "" {
		gender = model.ModelGenderNeutral
	}
	m := model.ModelAsset{
		WorkspaceID: wsID,
		Name:        in.Name,
		Kind:        kind,
		Gender:      gender,
		Style:       in.Style,
		Description: in.Description,
		AvatarURL:   in.AvatarURL,
	}
	if err := s.db.WithContext(ctx).Create(&m).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建模特失败", err)
	}
	return &m, nil
}

func (s *ModelAssetService) Update(ctx context.Context, wsID, mid uuid.UUID, patch ModelPatch) (*model.ModelAsset, error) {
	m, err := s.get(ctx, wsID, mid)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if patch.Name != nil {
		updates["name"] = *patch.Name
	}
	if patch.Style != nil {
		updates["style"] = *patch.Style
	}
	if patch.Description != nil {
		updates["description"] = *patch.Description
	}
	if patch.IsFavorite != nil {
		updates["is_favorite"] = *patch.IsFavorite
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(m).Updates(updates).Error; err != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "更新模特失败", err)
		}
	}
	return s.get(ctx, wsID, mid)
}

func (s *ModelAssetService) Delete(ctx context.Context, wsID, mid uuid.UUID) error {
	res := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", mid, wsID).Delete(&model.ModelAsset{})
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "删除模特失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return apperr.NotFound("模特不存在")
	}
	return nil
}

func (s *ModelAssetService) get(ctx context.Context, wsID, mid uuid.UUID) (*model.ModelAsset, error) {
	var m model.ModelAsset
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", mid, wsID).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("模特不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询模特失败", err)
	}
	return &m, nil
}
