package service

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/llm"
	"github.com/faxianmao/server/internal/storage"
)

type MaterialService struct {
	db      *gorm.DB
	storage *storage.Storage
	llm     *llm.Client
	quota   *QuotaService
}

func NewMaterialService(db *gorm.DB, st *storage.Storage, l *llm.Client, q *QuotaService) *MaterialService {
	return &MaterialService{db: db, storage: st, llm: l, quota: q}
}

// MaterialUpload 是一次上传的入参(由 handler 从 multipart 解析)。
type MaterialUpload struct {
	OriginalName string
	ContentType  string
	Size         int64
	Data         []byte
	Tags         []string
	Note         *string
}

func (s *MaterialService) StorageReady() bool { return s.storage.Configured() }

// List 列出工作台素材,typeFilter 为空则不筛。
func (s *MaterialService) List(ctx context.Context, wsID uuid.UUID, typeFilter string) ([]model.Material, error) {
	q := s.db.WithContext(ctx).Where("workspace_id = ?", wsID)
	if typeFilter != "" {
		q = q.Where("type = ?", typeFilter)
	}
	var items []model.Material
	if err := q.Order("created_at DESC").Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询素材失败", err)
	}
	return items, nil
}

// Upload 先建占位行拿到 id,再算 key 上传 COS,最后回写 url/storageKey。
func (s *MaterialService) Upload(ctx context.Context, wsID uuid.UUID, in MaterialUpload) (*model.Material, error) {
	if !s.storage.Configured() {
		return nil, apperr.New(apperr.CodeServiceUnavailable, "存储未配置:请设置 TENCENT_COS_BUCKET/REGION/SECRET_ID/SECRET_KEY")
	}
	ct := in.ContentType
	m := model.Material{
		WorkspaceID:  wsID,
		Type:         detectMaterialType(ct, in.OriginalName),
		OriginalName: in.OriginalName,
		URL:          "",
		ContentType:  &ct,
		SizeBytes:    in.Size,
		Tags:         in.Tags,
		Note:         in.Note,
	}
	if err := s.db.WithContext(ctx).Create(&m).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建素材失败", err)
	}

	key := deriveMaterialPath(wsID, m.ID, in.OriginalName)
	url, err := s.storage.Put(ctx, key, in.Data, ct)
	if err != nil {
		// 上传失败:回滚占位行
		s.db.WithContext(ctx).Delete(&model.Material{}, "id = ?", m.ID)
		return nil, apperr.Wrap(apperr.CodeServiceUnavailable, "上传失败:存储服务异常", err)
	}

	if err := s.db.WithContext(ctx).Model(&m).
		Updates(map[string]any{"url": url, "storage_key": key}).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "回写素材失败", err)
	}
	m.URL = url
	m.StorageKey = &key
	return &m, nil
}

// GenerateMaterial 用文字 prompt 调 seedream 出一张图,存为该工作台的 IMAGE 素材,
// 供「添加」弹窗的「AI 生成」tab 用。同步出图(国内直连可达,十几秒返回)。
// 出图额度前置扣减,出图/落库失败时按 refID 退回。
// imageSize 传画幅比例("1:1"/"9:16" 等,前端当前不传,默认 1:1)。
func (s *MaterialService) GenerateMaterial(ctx context.Context, wsID uuid.UUID, prompt, imageSize string) (*model.Material, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, apperr.BadRequest("请输入生成描述")
	}
	if !s.storage.Configured() {
		return nil, apperr.New(apperr.CodeServiceUnavailable, "存储未配置")
	}
	if s.llm == nil || !s.llm.Configured() {
		return nil, apperr.New(apperr.CodeServiceUnavailable, "出图服务未配置,请稍后再试")
	}
	if imageSize == "" {
		imageSize = "1:1"
	}

	refID := uuid.New()
	if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageImage, 1, &refID); err != nil {
		return nil, err
	}
	refund := func() {
		rctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		s.quota.Refund(rctx, refID, model.UsageImage)
		cancel()
	}

	gctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	data, ct, err := s.llm.GenerateImage(gctx, prompt, imageSize, nil)
	if err != nil {
		refund()
		return nil, apperr.Wrap(apperr.CodeServiceUnavailable, "AI 出图失败,请重试", err)
	}
	if ct == "" {
		ct = "image/jpeg"
	}
	ext := ".jpg"
	if strings.Contains(strings.ToLower(ct), "png") {
		ext = ".png"
	}

	m, err := s.Upload(ctx, wsID, MaterialUpload{
		OriginalName: "ai-" + refID.String()[:8] + ext,
		ContentType:  ct,
		Size:         int64(len(data)),
		Data:         data,
		Tags:         []string{"AI 生成"},
		Note:         &prompt,
	})
	if err != nil {
		refund()
		return nil, err
	}
	return m, nil
}

// Delete 删 DB 行,并尽力清理 COS 原始对象(清理失败不阻断删除)。
func (s *MaterialService) Delete(ctx context.Context, wsID, mid uuid.UUID) error {
	var m model.Material
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", mid, wsID).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return apperr.NotFound("素材不存在")
	}
	if err != nil {
		return apperr.Wrap(apperr.CodeInternal, "查询素材失败", err)
	}
	if m.StorageKey != nil && *m.StorageKey != "" && s.storage.Configured() {
		_ = s.storage.Delete(ctx, *m.StorageKey) // best-effort
	}
	if err := s.db.WithContext(ctx).Delete(&model.Material{}, "id = ?", mid).Error; err != nil {
		return apperr.Wrap(apperr.CodeInternal, "删除素材失败", err)
	}
	return nil
}

// detectMaterialType 由 content-type / 文件名推断素材类型。
func detectMaterialType(contentType, name string) string {
	ct := strings.ToLower(contentType)
	switch {
	case strings.HasPrefix(ct, "image/"):
		return "IMAGE"
	case strings.HasPrefix(ct, "video/"):
		return "VIDEO"
	case strings.HasPrefix(ct, "audio/"):
		return "AUDIO"
	case strings.HasPrefix(ct, "font/"):
		return "FONT"
	}
	switch strings.ToLower(filepath.Ext(name)) {
	case ".woff", ".woff2", ".ttf", ".otf":
		return "FONT"
	}
	return "IMAGE"
}

// deriveMaterialPath 保留原始扩展名:workspaces/{ws}/materials/{id}{ext}
func deriveMaterialPath(wsID, matID uuid.UUID, originalName string) string {
	ext := strings.ToLower(filepath.Ext(originalName))
	return fmt.Sprintf("workspaces/%s/materials/%s%s", wsID, matID, ext)
}
