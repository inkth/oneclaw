package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm/clause"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
)

// 收藏支持的实体类型(商品走 WorkspaceDiscoverInteraction.IsStarred,不在此列)。
var favoriteKinds = map[string]bool{"seller": true, "influencer": true, "video": true}

// FavoriteInput 收藏/取消收藏。Snapshot 是 {name,cover,subtitle,metric},供收藏页渲染。
type FavoriteInput struct {
	Kind       string          `json:"kind" binding:"required"`
	ExternalID string          `json:"externalId" binding:"required"`
	Region     string          `json:"region" binding:"required"`
	Starred    bool            `json:"starred"`
	Snapshot   json.RawMessage `json:"snapshot"`
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

type favSnapshot struct {
	Name     string `json:"name"`
	Cover    string `json:"cover"`
	Subtitle string `json:"subtitle"`
	Metric   string `json:"metric"`
}

// ToggleFavorite 收藏(upsert)或取消(delete)店铺/达人/视频。
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
	snap := model.JSONB(in.Snapshot)
	rec := model.WorkspaceDiscoverFavorite{
		WorkspaceID: wsID, Kind: in.Kind, ExternalID: in.ExternalID, Region: in.Region, Snapshot: snap,
	}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "workspace_id"}, {Name: "kind"}, {Name: "external_id"}, {Name: "region"}},
		DoUpdates: clause.AssignmentColumns([]string{"snapshot"}),
	}).Create(&rec).Error
}

// IsFavorited 单条收藏状态(供详情页初始化星标)。
func (s *DiscoverService) IsFavorited(ctx context.Context, wsID uuid.UUID, kind, externalID, region string) bool {
	var n int64
	s.db.WithContext(ctx).Model(&model.WorkspaceDiscoverFavorite{}).
		Where("workspace_id = ? AND kind = ? AND external_id = ? AND region = ?", wsID, kind, externalID, region).
		Count(&n)
	return n > 0
}

// ListFavorites 汇总工作台收藏:商品(收藏星标)+ 店铺/达人/视频,按时间倒序。
func (s *DiscoverService) ListFavorites(ctx context.Context, wsID uuid.UUID) ([]FavoriteItemDTO, error) {
	items := make([]FavoriteItemDTO, 0)

	// 1. 商品:WorkspaceDiscoverInteraction.IsStarred → join DiscoverProduct。
	var inters []model.WorkspaceDiscoverInteraction
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND is_starred = ?", wsID, true).
		Find(&inters).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询收藏失败", err)
	}
	if len(inters) > 0 {
		dpIDs := make([]uuid.UUID, 0, len(inters))
		createdByDP := make(map[uuid.UUID]time.Time, len(inters))
		for _, it := range inters {
			dpIDs = append(dpIDs, it.DiscoverProductID)
			createdByDP[it.DiscoverProductID] = it.CreatedAt
		}
		var dps []model.DiscoverProduct
		s.db.WithContext(ctx).Where("id IN ?", dpIDs).Find(&dps)
		for _, dp := range dps {
			cover := ""
			if covers := parseCovers(dp.CoverUrls); len(covers) > 0 {
				cover = covers[0]
			}
			items = append(items, FavoriteItemDTO{
				Kind: "product", ExternalID: dp.ExternalID, Region: dp.Region,
				Name: dp.Name, Cover: cover,
				Subtitle:  dp.Region,
				Metric:    fmtCentsUSD(dp.AvgPriceCents),
				Href:      favoriteHref("product", dp.ExternalID, dp.Region),
				CreatedAt: createdByDP[dp.ID],
			})
		}
	}

	// 2. 店铺/达人/视频:从 favorites 表 + 快照渲染。
	var favs []model.WorkspaceDiscoverFavorite
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).Find(&favs).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询收藏失败", err)
	}
	for _, f := range favs {
		var sn favSnapshot
		_ = json.Unmarshal(f.Snapshot, &sn)
		items = append(items, FavoriteItemDTO{
			Kind: f.Kind, ExternalID: f.ExternalID, Region: f.Region,
			Name: sn.Name, Cover: sn.Cover, Subtitle: sn.Subtitle, Metric: sn.Metric,
			Href:      favoriteHref(f.Kind, f.ExternalID, f.Region),
			CreatedAt: f.CreatedAt,
		})
	}

	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	return items, nil
}

func favoriteHref(kind, externalID, region string) string {
	base := map[string]string{
		"product":    "/app/discover/products/",
		"seller":     "/app/discover/sellers/",
		"influencer": "/app/discover/influencers/",
		"video":      "/app/discover/videos/",
	}[kind]
	if base == "" {
		return ""
	}
	return base + externalID + "?region=" + region
}

func fmtCentsUSD(cents int) string {
	if cents <= 0 {
		return ""
	}
	return fmt.Sprintf("$%.2f", float64(cents)/100)
}
