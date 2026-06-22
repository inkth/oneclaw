package service

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm/clause"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
)

// 收藏支持的实体类型(商品收藏已并入选品 products 表,不走这里)。
var favoriteKinds = map[string]bool{"seller": true, "influencer": true, "video": true}

// FavoriteInput 收藏/取消收藏。Snapshot 字段已废弃(实体落库后收藏页直接读主表渲染),仅为兼容旧前端保留、不再使用。
type FavoriteInput struct {
	Kind       string          `json:"kind" binding:"required"`
	ExternalID string          `json:"externalId" binding:"required"`
	Region     string          `json:"region" binding:"required"`
	Starred    bool            `json:"starred"`
	Snapshot   json.RawMessage `json:"snapshot"` // deprecated: 忽略
}

// FavoriteItemDTO 收藏页统一条目。
type FavoriteItemDTO struct {
	Kind       string    `json:"kind"` // product | seller | influencer | video
	ExternalID string    `json:"externalId"`
	Region     string    `json:"region"`
	Name       string    `json:"name"`
	Cover      string    `json:"cover"`
	Subtitle   string    `json:"subtitle"`
	Metric     string    `json:"metric"`
	Href       string    `json:"href"`
	CreatedAt  time.Time `json:"createdAt"`
}

// ToggleFavorite 收藏(只存关系)或取消(delete)店铺/达人/视频。
// 收藏不再存快照——收藏页直接读实体主表(DiscoverSeller/Influencer/Video)渲染;同时把实体标为
// tracked(高优先级刷新)。
func (s *DiscoverService) ToggleFavorite(ctx context.Context, wsID uuid.UUID, in FavoriteInput) error {
	if !favoriteKinds[in.Kind] {
		return apperr.BadRequest("不支持的收藏类型:" + in.Kind)
	}
	if !in.Starred {
		return s.db.WithContext(ctx).
			Where("workspace_id = ? AND kind = ? AND external_id = ? AND region = ?",
				wsID, in.Kind, in.ExternalID, in.Region).
			Delete(&model.WorkspaceDiscoverFavorite{}).Error
	}
	// 已存在则保持原 created_at(DoNothing),不重置收藏时间。
	rec := model.WorkspaceDiscoverFavorite{
		WorkspaceID: wsID, Kind: in.Kind, ExternalID: in.ExternalID, Region: in.Region,
	}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "workspace_id"}, {Name: "kind"}, {Name: "external_id"}, {Name: "region"}},
		DoNothing: true,
	}).Create(&rec).Error; err != nil {
		return err
	}
	s.markFavoriteEntity(ctx, in.Kind, in.ExternalID, in.Region)
	return nil
}

// IsFavorited 单条收藏状态(供详情页初始化星标)。
func (s *DiscoverService) IsFavorited(ctx context.Context, wsID uuid.UUID, kind, externalID, region string) bool {
	var n int64
	s.db.WithContext(ctx).Model(&model.WorkspaceDiscoverFavorite{}).
		Where("workspace_id = ? AND kind = ? AND external_id = ? AND region = ?", wsID, kind, externalID, region).
		Count(&n)
	return n > 0
}

// ListFavorites 汇总工作台收藏:店铺/达人/视频,按时间倒序。渲染数据从实体主表读(已退役快照);
// 主表暂缺(如刚收藏、尚未落库)的条目仍返回,name/cover 留空由前端占位。
// 商品收藏已并入选品 products 表(见 GET /workspaces/:wid/products),此处只管非商品实体。
func (s *DiscoverService) ListFavorites(ctx context.Context, wsID uuid.UUID) ([]FavoriteItemDTO, error) {
	items := make([]FavoriteItemDTO, 0)
	var favs []model.WorkspaceDiscoverFavorite
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).Find(&favs).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询收藏失败", err)
	}
	for _, f := range favs {
		item := FavoriteItemDTO{
			Kind: f.Kind, ExternalID: f.ExternalID, Region: f.Region,
			Href:      favoriteHref(f.Kind, f.ExternalID, f.Region),
			CreatedAt: f.CreatedAt,
		}
		s.fillFavoriteFromEntity(ctx, &item)
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	return items, nil
}

// fillFavoriteFromEntity 从实体主表补 name/cover/subtitle/metric(查不到则留空)。
func (s *DiscoverService) fillFavoriteFromEntity(ctx context.Context, item *FavoriteItemDTO) {
	switch item.Kind {
	case "influencer":
		var di model.DiscoverInfluencer
		if s.db.WithContext(ctx).
			Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, item.ExternalID, item.Region).
			First(&di).Error == nil {
			item.Name, item.Cover = di.NickName, di.AvatarURL
			item.Subtitle = di.Category
			if item.Subtitle == "" {
				item.Subtitle = "@" + di.UniqueID
			}
			item.Metric = humanInt(di.Followers) + " 粉丝"
		}
	case "seller":
		var ds model.DiscoverSeller
		if s.db.WithContext(ctx).
			Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, item.ExternalID, item.Region).
			First(&ds).Error == nil {
			item.Name, item.Cover = ds.SellerName, ds.CoverURL
			if cats := parseCategories(ds.Categories); len(cats) > 0 {
				item.Subtitle = cats[0]
			}
			item.Metric = "GMV $" + humanInt(ds.SaleGmvCents/100)
		}
	case "video":
		var dv model.DiscoverVideo
		if s.db.WithContext(ctx).
			Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, item.ExternalID, item.Region).
			First(&dv).Error == nil {
			item.Name = dv.NickName
			if item.Name == "" {
				item.Name = dv.Desc
			}
			item.Cover = dv.CoverURL
			item.Subtitle = "@" + dv.UniqueID
			item.Metric = humanInt(dv.Views) + " 播放"
		}
	}
}

func favoriteHref(kind, externalID, region string) string {
	base := map[string]string{
		"seller":     "/app/discover/sellers/",
		"influencer": "/app/discover/influencers/",
		"video":      "/app/discover/videos/",
	}[kind]
	if base == "" {
		return ""
	}
	return base + externalID + "?region=" + region
}
