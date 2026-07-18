package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// 搜索:EchoTik 优先(探索新内容是其强项),失败/未配置时回落到已落库实体的本地匹配,
// —— EchoTik 不可用时搜索仍以真实数据可用。本地匹配按累计指标降序。

// ── 本地匹配(name ILIKE) ──────────────────────────────────────────────────────

func (s *DiscoverService) searchLocalProducts(ctx context.Context, p echotik.RanklistParams) ([]model.DiscoverProduct, bool) {
	if s.db == nil || p.Keyword == "" {
		return nil, false
	}
	var dps []model.DiscoverProduct
	like := "%" + p.Keyword + "%"
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND name ILIKE ?", providerEchoTik, p.Region, like).
		Order("total_sale_cnt DESC").Limit(p.PageSize).Find(&dps).Error; err != nil || len(dps) == 0 {
		return nil, false
	}
	return dps, true
}

func (s *DiscoverService) searchLocalSellers(ctx context.Context, p echotik.RanklistParams) ([]SellerDTO, bool) {
	if s.db == nil || p.Keyword == "" {
		return nil, false
	}
	var rows []model.DiscoverSeller
	like := "%" + p.Keyword + "%"
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND seller_name ILIKE ?", providerEchoTik, p.Region, like).
		Order("sale_gmv_cents DESC").Limit(p.PageSize).Find(&rows).Error; err != nil || len(rows) == 0 {
		return nil, false
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	sparks := s.loadSellerSparks(ctx, ids)
	cat := s.categoryZh(ctx, p.Region)
	out := make([]SellerDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapSellerFromModel(r, sparks[r.ID], cat))
	}
	return out, true
}

func (s *DiscoverService) searchLocalInfluencers(ctx context.Context, p echotik.RanklistParams) ([]InfluencerDTO, bool) {
	if s.db == nil || p.Keyword == "" {
		return nil, false
	}
	var rows []model.DiscoverInfluencer
	like := "%" + p.Keyword + "%"
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND (nick_name ILIKE ? OR unique_id ILIKE ?)", providerEchoTik, p.Region, like, like).
		Order("followers DESC").Limit(p.PageSize).Find(&rows).Error; err != nil || len(rows) == 0 {
		return nil, false
	}
	out := make([]InfluencerDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapInfluencerFromModel(r))
	}
	return out, true
}

func (s *DiscoverService) searchLocalVideos(ctx context.Context, p echotik.RanklistParams) ([]VideoDTO, bool) {
	if s.db == nil || p.Keyword == "" {
		return nil, false
	}
	var rows []model.DiscoverVideo
	like := "%" + p.Keyword + "%"
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND (video_desc ILIKE ? OR nick_name ILIKE ?)", providerEchoTik, p.Region, like, like).
		Order("views DESC").Limit(p.PageSize).Find(&rows).Error; err != nil || len(rows) == 0 {
		return nil, false
	}
	out := make([]VideoDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapVideoFromModel(r))
	}
	return out, true
}

// ── 三类搜索(DB-first + 后台异步落库) ─────────────────────────────────────────
// 读路径零同步 EchoTik:先返回本地 ILIKE 匹配,再 goRefresh 用 echo.Search* 拉取并 upsert 主表
// (下次本地即可命中);本地空且 echo 已配置时返回空+warming;未配置返回空态。

func (s *DiscoverService) searchSellers(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[SellerDTO] {
	if s.echo.Configured() {
		goRefresh(ctx, "search-sellers", func(bg context.Context) {
			if raw, err := s.echo.SearchSellers(bg, p.Keyword, p.Region, p.PageSize); err == nil && len(raw) > 0 {
				for i := range raw {
					if raw[i].Region == "" {
						raw[i].Region = p.Region
					}
				}
				s.upsertSellerList(bg, p.Region, raw)
			}
		})
	}
	if rows, ok := s.searchLocalSellers(ctx, p); ok {
		return &EntityRanklistResult[SellerDTO]{State: "cached", Rows: rows}
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[SellerDTO]{State: "empty", Rows: []SellerDTO{}}
	}
	return &EntityRanklistResult[SellerDTO]{State: "cached", Warming: true, Rows: []SellerDTO{}}
}

func (s *DiscoverService) searchInfluencers(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[InfluencerDTO] {
	if s.echo.Configured() {
		goRefresh(ctx, "search-influencers", func(bg context.Context) {
			if raw, err := s.echo.SearchInfluencers(bg, p.Keyword, p.Region, p.PageSize); err == nil && len(raw) > 0 {
				s.upsertInfluencerList(bg, p.Region, raw)
			}
		})
	}
	if rows, ok := s.searchLocalInfluencers(ctx, p); ok {
		return &EntityRanklistResult[InfluencerDTO]{State: "cached", Rows: rows}
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[InfluencerDTO]{State: "empty", Rows: []InfluencerDTO{}}
	}
	return &EntityRanklistResult[InfluencerDTO]{State: "cached", Warming: true, Rows: []InfluencerDTO{}}
}

func (s *DiscoverService) searchVideos(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[VideoDTO] {
	if s.echo.Configured() {
		goRefresh(ctx, "search-videos", func(bg context.Context) {
			if raw, err := s.echo.SearchVideos(bg, p.Keyword, p.Region, p.PageSize); err == nil && len(raw) > 0 {
				s.upsertVideoList(bg, p.Region, raw)
			}
		})
	}
	if rows, ok := s.searchLocalVideos(ctx, p); ok {
		return &EntityRanklistResult[VideoDTO]{State: "cached", Rows: rows}
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[VideoDTO]{State: "empty", Rows: []VideoDTO{}}
	}
	return &EntityRanklistResult[VideoDTO]{State: "cached", Warming: true, Rows: []VideoDTO{}}
}
