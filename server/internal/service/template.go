package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/llm"
)

type TemplateService struct {
	db  *gorm.DB
	llm *llm.Client
}

func NewTemplateService(db *gorm.DB, l *llm.Client) *TemplateService {
	return &TemplateService{db: db, llm: l}
}

type TemplateInput struct {
	Name           string  `json:"name" binding:"required,max=80"`
	Description    *string `json:"description"`
	Emoji          *string `json:"emoji"`
	Engine         string  `json:"engine"`
	DurationSec    int     `json:"durationSec"`
	AspectRatio    string  `json:"aspectRatio" binding:"omitempty,oneof=9:16 16:9 1:1"`
	Style          string  `json:"style" binding:"omitempty,oneof=UNBOXING COMPARISON SCENE BEFORE_AFTER"`
	PromptTemplate string  `json:"promptTemplate" binding:"required,min=5"`
	GenerateScript bool    `json:"generateScript"`
	GenerateCover  bool    `json:"generateCover"`
}

type TemplatePatch struct {
	Name           *string `json:"name"`
	Description    *string `json:"description"`
	PromptTemplate *string `json:"promptTemplate"`
	IsFavorite     *bool   `json:"isFavorite"`
}

func (s *TemplateService) List(ctx context.Context, wsID uuid.UUID) ([]model.CreationTemplate, error) {
	var items []model.CreationTemplate
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("is_favorite DESC").Order("usage_count DESC").Order("created_at DESC").
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询模板失败", err)
	}
	return items, nil
}

func (s *TemplateService) Create(ctx context.Context, wsID uuid.UUID, in TemplateInput) (*model.CreationTemplate, error) {
	t := model.CreationTemplate{
		WorkspaceID: wsID, Name: in.Name, Description: in.Description, Emoji: in.Emoji,
		Engine: orStr(in.Engine, "seedance"), DurationSec: orInt(in.DurationSec, 5),
		AspectRatio: orStr(in.AspectRatio, "9:16"), Style: orStr(in.Style, model.VideoStyleScene),
		PromptTemplate: in.PromptTemplate, GenerateScript: in.GenerateScript, GenerateCover: in.GenerateCover,
		DefaultMaterialIDs: []string{},
	}
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建模板失败", err)
	}
	return &t, nil
}

func (s *TemplateService) Update(ctx context.Context, wsID, tid uuid.UUID, patch TemplatePatch) (*model.CreationTemplate, error) {
	t, err := s.get(ctx, wsID, tid)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if patch.Name != nil {
		updates["name"] = *patch.Name
	}
	if patch.Description != nil {
		updates["description"] = *patch.Description
	}
	if patch.PromptTemplate != nil {
		updates["prompt_template"] = *patch.PromptTemplate
	}
	if patch.IsFavorite != nil {
		updates["is_favorite"] = *patch.IsFavorite
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(t).Updates(updates).Error; err != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "更新模板失败", err)
		}
	}
	return s.get(ctx, wsID, tid)
}

func (s *TemplateService) Delete(ctx context.Context, wsID, tid uuid.UUID) error {
	res := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", tid, wsID).Delete(&model.CreationTemplate{})
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "删除模板失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return apperr.NotFound("模板不存在")
	}
	return nil
}

const templateOptimizeSystem = `你是短视频提示词优化助手。把用户给的视频提示词改写得更具体、更有镜头感(画面、光线、运镜、节奏),适合文生视频模型。只返回改写后的提示词本身,不要解释、不要引号。`

// Optimize 用 LLM 优化一段视频提示词,返回改写结果(不落库)。
func (s *TemplateService) Optimize(ctx context.Context, promptTemplate string) (string, error) {
	if !s.llm.Configured() {
		return "", apperr.New(apperr.CodeServiceUnavailable, "AI 未配置")
	}
	res, err := s.llm.Chat(ctx, templateOptimizeSystem, promptTemplate, false, 800)
	if err != nil {
		return "", apperr.Wrap(apperr.CodeUpstream, "优化失败", err)
	}
	return res.Content, nil
}

func (s *TemplateService) get(ctx context.Context, wsID, tid uuid.UUID) (*model.CreationTemplate, error) {
	var t model.CreationTemplate
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", tid, wsID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("模板不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询模板失败", err)
	}
	return &t, nil
}

func orStr(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
func orInt(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}
