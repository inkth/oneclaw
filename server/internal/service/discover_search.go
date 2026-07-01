package service

import (
	"context"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// 搜索:EchoTik 优先(探索新内容是其强项),失败/未配置时回落到已落库实体的本地匹配,
// 而非返回 mock —— EchoTik 不可用时搜索仍以真实数据可用。本地匹配按累计指标降序。

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
	out := make([]SellerDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapSellerFromModel(r))
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

// ── 三类搜索(EchoTik 优先 + 本地兜底) ─────────────────────────────────────────

func (s *DiscoverService) searchSellers(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[SellerDTO] {
	if s.echo.Configured() {
		if raw, err := s.echo.SearchSellers(ctx, p.Keyword, p.Region, p.PageSize); err == nil && len(raw) > 0 {
			for i := range raw {
				if raw[i].Region == "" {
					raw[i].Region = p.Region
				}
			}
			return &EntityRanklistResult[SellerDTO]{State: "live", Rows: s.hostMapSellers(ctx, raw)}
		}
	}
	if rows, ok := s.searchLocalSellers(ctx, p); ok {
		return &EntityRanklistResult[SellerDTO]{State: "cached", Rows: rows}
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[SellerDTO]{State: "mock", Rows: s.hostMapSellers(ctx, echotik.MockSearchSellers(p.Region, p.Keyword, p.PageSize))}
	}
	return &EntityRanklistResult[SellerDTO]{State: "empty", Rows: []SellerDTO{}}
}

func (s *DiscoverService) searchInfluencers(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[InfluencerDTO] {
	if s.echo.Configured() {
		if raw, err := s.echo.SearchInfluencers(ctx, p.Keyword, p.Region, p.PageSize); err == nil && len(raw) > 0 {
			return &EntityRanklistResult[InfluencerDTO]{State: "live", Rows: s.hostMapInfluencers(ctx, raw)}
		}
	}
	if rows, ok := s.searchLocalInfluencers(ctx, p); ok {
		return &EntityRanklistResult[InfluencerDTO]{State: "cached", Rows: rows}
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[InfluencerDTO]{State: "mock", Rows: s.hostMapInfluencers(ctx, echotik.MockSearchInfluencers(p.Region, p.Keyword, p.PageSize))}
	}
	return &EntityRanklistResult[InfluencerDTO]{State: "empty", Rows: []InfluencerDTO{}}
}

func (s *DiscoverService) searchVideos(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[VideoDTO] {
	if s.echo.Configured() {
		if raw, err := s.echo.SearchVideos(ctx, p.Keyword, p.Region, p.PageSize); err == nil && len(raw) > 0 {
			return &EntityRanklistResult[VideoDTO]{State: "live", Rows: s.hostMapVideos(ctx, raw)}
		}
	}
	if rows, ok := s.searchLocalVideos(ctx, p); ok {
		return &EntityRanklistResult[VideoDTO]{State: "cached", Rows: rows}
	}
	if !s.echo.Configured() {
		return &EntityRanklistResult[VideoDTO]{State: "mock", Rows: s.hostMapVideos(ctx, echotik.MockSearchVideos(p.Region, p.Keyword, p.PageSize))}
	}
	return &EntityRanklistResult[VideoDTO]{State: "empty", Rows: []VideoDTO{}}
}
