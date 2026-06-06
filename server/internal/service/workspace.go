package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
)

type WorkspaceService struct {
	db *gorm.DB
}

func NewWorkspaceService(db *gorm.DB) *WorkspaceService {
	return &WorkspaceService{db: db}
}

// createDefaultForUser 在事务内为新用户建默认 workspace + OWNER membership。
func createDefaultForUser(tx *gorm.DB, userID uuid.UUID, name string) (*model.Workspace, error) {
	if name == "" {
		name = "我的工作台"
	}
	ws := model.Workspace{
		ID:      uuid.New(),
		Name:    name,
		Slug:    "ws-" + strings.ReplaceAll(uuid.New().String(), "-", "")[:12],
		Plan:    model.PlanFree,
		OwnerID: userID,
	}
	if err := tx.Create(&ws).Error; err != nil {
		return nil, err
	}
	mem := model.Membership{UserID: userID, WorkspaceID: ws.ID, Role: model.RoleOwner}
	if err := tx.Create(&mem).Error; err != nil {
		return nil, err
	}
	return &ws, nil
}

// GetDefault 返回用户的默认(最早加入的)工作台。
func (s *WorkspaceService) GetDefault(ctx context.Context, userID uuid.UUID) (*model.Workspace, error) {
	var mem model.Membership
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at ASC").
		First(&mem).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// 兜底:历史用户无 workspace 时补建。
		var ws *model.Workspace
		txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			w, e := createDefaultForUser(tx, userID, "")
			ws = w
			return e
		})
		if txErr != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "创建默认工作台失败", txErr)
		}
		return ws, nil
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	var ws model.Workspace
	if err := s.db.WithContext(ctx).First(&ws, "id = ?", mem.WorkspaceID).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询工作台失败", err)
	}
	return &ws, nil
}

// Authorize 校验用户是该工作台成员,返回角色。
func (s *WorkspaceService) Authorize(ctx context.Context, userID, workspaceID uuid.UUID) (string, error) {
	var mem model.Membership
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND workspace_id = ?", userID, workspaceID).
		First(&mem).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", apperr.Forbidden("无权访问该工作台")
	}
	if err != nil {
		return "", apperr.Wrap(apperr.CodeInternal, "鉴权失败", err)
	}
	return mem.Role, nil
}
