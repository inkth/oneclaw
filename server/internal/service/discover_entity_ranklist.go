package service

import (
	"context"
	"time"

	"gorm.io/gorm/clause"

	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// 榜单读 DB 化:店铺/达人/视频榜 = EntityRanklistEntry 顺序 + 关联实体主表渲染(零 EchoTik)。
// 封面用主表已 rehost 的 COS 永久 URL。job(PrewarmEntities)与冷启动兜底负责写顺序表。
// 仅主流榜(page1 + 无类目)走 DB;类目/翻页暂走 live 兜底(③ 再 DB 化)。

func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func gmvCentsToDollars(cents int) float64 { return float64(cents) / 100.0 }

// normPage 归一页码:<=0 视为第 1 页(顺序表与读路径共用,保证键对齐)。
func normPage(n int) int {
	if n <= 0 {
		return 1
	}
	return n
}

// writeEntityRanklist upsert 一条榜单顺序快照
// ((provider,kind,region,rank_type,rank_field,category_id,page_num) 幂等)。
func (s *DiscoverService) writeEntityRanklist(ctx context.Context, kind string, p echotik.RanklistParams, ids []string) {
	if s.db == nil || len(ids) == 0 {
		return
	}
	e := model.EntityRanklistEntry{
		Provider: providerEchoTik, Kind: kind, Region: p.Region,
		RankType: p.RankType, RankField: p.RankField, CategoryID: p.CategoryID,
		PageNum:     normPage(p.PageNum),
		ExternalIDs: ids, FetchedAt: time.Now(),
	}
	s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "provider"}, {Name: "kind"}, {Name: "region"},
			{Name: "rank_type"}, {Name: "rank_field"}, {Name: "category_id"}, {Name: "page_num"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"external_ids", "fetched_at"}),
	}).Create(&e)
}

// lookupRanklistIDs 读榜单顺序(按页)。不看 TTL(有就用):保证 EchoTik 不可用时榜单仍可读,新鲜由 job 保证。
func (s *DiscoverService) lookupRanklistIDs(ctx context.Context, kind string, p echotik.RanklistParams) ([]string, time.Time, bool) {
	if s.db == nil {
		return nil, time.Time{}, false
	}
	var e model.EntityRanklistEntry
	err := s.db.WithContext(ctx).
		Where("provider = ? AND kind = ? AND region = ? AND rank_type = ? AND rank_field = ? AND category_id = ? AND page_num = ?",
			providerEchoTik, kind, p.Region, p.RankType, p.RankField, p.CategoryID, normPage(p.PageNum)).
		First(&e).Error
	if err != nil || len(e.ExternalIDs) == 0 {
		return nil, time.Time{}, false
	}
	return e.ExternalIDs, e.FetchedAt, true
}

// ── 店铺 ──────────────────────────────────────────────────────────────────────

func mapSellerFromModel(ds model.DiscoverSeller) SellerDTO {
	return SellerDTO{
		SellerID: ds.ExternalID, SellerName: ds.SellerName, Region: ds.Region,
		CoverURL: strPtrOrNil(ds.CoverURL), Rating: ds.Rating, Categories: parseCategories(ds.Categories),
		TotalProductCnt: ds.ProductCnt, TotalSaleCnt: ds.SaleCnt, TotalSaleGmvAmt: gmvCentsToDollars(ds.SaleGmvCents),
		TotalIflCnt: ds.IflCnt, TotalVideoCnt: ds.VideoCnt, TotalLiveCnt: ds.LiveCnt,
	}
}

func (s *DiscoverService) lookupSellerRanklist(ctx context.Context, p echotik.RanklistParams) (*EntityRanklistResult[SellerDTO], bool) {
	ids, fetchedAt, ok := s.lookupRanklistIDs(ctx, "seller", p)
	if !ok {
		return nil, false
	}
	var rows []model.DiscoverSeller
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, p.Region, ids).
		Find(&rows).Error; err != nil {
		return nil, false
	}
	byID := make(map[string]model.DiscoverSeller, len(rows))
	for _, r := range rows {
		byID[r.ExternalID] = r
	}
	out := make([]SellerDTO, 0, len(ids))
	for _, id := range ids {
		if r, ok := byID[id]; ok {
			out = append(out, mapSellerFromModel(r))
		}
	}
	if len(out) == 0 {
		return nil, false
	}
	at := fetchedAt
	return &EntityRanklistResult[SellerDTO]{State: "cached", FetchedAt: &at, Rows: out}, true
}

// fetchSellerRanklistLive 冷启动/类目/翻页兜底:拉 raw;主流榜(page1)落库供下次,其余只签名映射返回。
func (s *DiscoverService) fetchSellerRanklistLive(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[SellerDTO] {
	if !s.echo.Configured() {
		return &EntityRanklistResult[SellerDTO]{State: "mock", Rows: s.hostMapSellers(ctx, echotik.MockSellers(p.Region, p.PageSize))}
	}
	raw, err := s.echo.GetSellerRanklist(ctx, p)
	if err != nil || len(raw) == 0 {
		return &EntityRanklistResult[SellerDTO]{State: "error", Rows: s.hostMapSellers(ctx, echotik.MockSellers(p.Region, p.PageSize))}
	}
	// 任意页都落库 + 写本页顺序,使该 (类目,页) 下次走本地;再回查以统一返回 COS/本地口径。
	s.upsertSellerList(ctx, p.Region, raw)
	s.writeEntityRanklist(ctx, "seller", p, sellerIDsOf(raw))
	if res, ok := s.lookupSellerRanklist(ctx, p); ok {
		res.State = "live"
		return res
	}
	now := time.Now()
	return &EntityRanklistResult[SellerDTO]{State: "live", FetchedAt: &now, Rows: s.hostMapSellers(ctx, raw)}
}

func sellerIDsOf(raw []echotik.SellerListItem) []string {
	ids := make([]string, 0, len(raw))
	for _, it := range raw {
		if it.SellerID != "" {
			ids = append(ids, it.SellerID)
		}
	}
	return ids
}

// ── 达人 ──────────────────────────────────────────────────────────────────────

func mapInfluencerFromModel(di model.DiscoverInfluencer) InfluencerDTO {
	return InfluencerDTO{
		UserID: di.ExternalID, UniqueID: di.UniqueID, NickName: di.NickName, Region: di.Region,
		AvatarURL: strPtrOrNil(di.AvatarURL), Category: di.Category, EcScore: di.EcScore,
		TotalFollowersCnt: di.Followers, TotalDiggCnt: di.DiggCnt, TotalProductCnt: di.ProductCnt,
		TotalPostVideoCnt: di.PostVideoCnt, TotalLiveCnt: di.LiveCnt,
		TotalSaleCnt: di.SaleCnt, TotalSaleGmvAmt: gmvCentsToDollars(di.SaleGmvCents),
	}
}

func (s *DiscoverService) lookupInfluencerRanklist(ctx context.Context, p echotik.RanklistParams) (*EntityRanklistResult[InfluencerDTO], bool) {
	ids, fetchedAt, ok := s.lookupRanklistIDs(ctx, "influencer", p)
	if !ok {
		return nil, false
	}
	var rows []model.DiscoverInfluencer
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, p.Region, ids).
		Find(&rows).Error; err != nil {
		return nil, false
	}
	byID := make(map[string]model.DiscoverInfluencer, len(rows))
	for _, r := range rows {
		byID[r.ExternalID] = r
	}
	out := make([]InfluencerDTO, 0, len(ids))
	for _, id := range ids {
		if r, ok := byID[id]; ok {
			out = append(out, mapInfluencerFromModel(r))
		}
	}
	if len(out) == 0 {
		return nil, false
	}
	at := fetchedAt
	return &EntityRanklistResult[InfluencerDTO]{State: "cached", FetchedAt: &at, Rows: out}, true
}

func (s *DiscoverService) fetchInfluencerRanklistLive(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[InfluencerDTO] {
	if !s.echo.Configured() {
		return &EntityRanklistResult[InfluencerDTO]{State: "mock", Rows: s.hostMapInfluencers(ctx, echotik.MockInfluencers(p.Region, p.PageSize))}
	}
	raw, err := s.echo.GetInfluencerRanklist(ctx, p)
	if err != nil || len(raw) == 0 {
		return &EntityRanklistResult[InfluencerDTO]{State: "error", Rows: s.hostMapInfluencers(ctx, echotik.MockInfluencers(p.Region, p.PageSize))}
	}
	s.upsertInfluencerList(ctx, p.Region, raw)
	s.writeEntityRanklist(ctx, "influencer", p, influencerIDsOf(raw))
	if res, ok := s.lookupInfluencerRanklist(ctx, p); ok {
		res.State = "live"
		return res
	}
	now := time.Now()
	return &EntityRanklistResult[InfluencerDTO]{State: "live", FetchedAt: &now, Rows: s.hostMapInfluencers(ctx, raw)}
}

func influencerIDsOf(raw []echotik.InfluencerListItem) []string {
	ids := make([]string, 0, len(raw))
	for _, it := range raw {
		if it.UserID != "" {
			ids = append(ids, it.UserID)
		}
	}
	return ids
}

// ── 视频 ──────────────────────────────────────────────────────────────────────

func mapVideoFromModel(dv model.DiscoverVideo) VideoDTO {
	return VideoDTO{
		VideoID: dv.ExternalID, NickName: dv.NickName, UniqueID: dv.UniqueID, Region: dv.Region,
		CoverURL: strPtrOrNil(dv.CoverURL), AvatarURL: strPtrOrNil(dv.AvatarURL),
		Desc: dv.Desc, Category: dv.Category, Duration: dv.Duration, CreateTime: dv.CreateTime,
		TotalViewsCnt: dv.Views, TotalDiggCnt: dv.Digg, TotalCommentsCnt: dv.Comments, TotalSharesCnt: dv.Shares,
		TotalVideoSaleCnt: dv.SaleCnt, TotalVideoSaleGmvAmt: gmvCentsToDollars(dv.SaleGmvCents),
	}
}

func (s *DiscoverService) lookupVideoRanklist(ctx context.Context, p echotik.RanklistParams) (*EntityRanklistResult[VideoDTO], bool) {
	ids, fetchedAt, ok := s.lookupRanklistIDs(ctx, "video", p)
	if !ok {
		return nil, false
	}
	var rows []model.DiscoverVideo
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, p.Region, ids).
		Find(&rows).Error; err != nil {
		return nil, false
	}
	byID := make(map[string]model.DiscoverVideo, len(rows))
	for _, r := range rows {
		byID[r.ExternalID] = r
	}
	out := make([]VideoDTO, 0, len(ids))
	for _, id := range ids {
		if r, ok := byID[id]; ok {
			out = append(out, mapVideoFromModel(r))
		}
	}
	if len(out) == 0 {
		return nil, false
	}
	at := fetchedAt
	return &EntityRanklistResult[VideoDTO]{State: "cached", FetchedAt: &at, Rows: out}, true
}

func (s *DiscoverService) fetchVideoRanklistLive(ctx context.Context, p echotik.RanklistParams) *EntityRanklistResult[VideoDTO] {
	if !s.echo.Configured() {
		return &EntityRanklistResult[VideoDTO]{State: "mock", Rows: s.hostMapVideos(ctx, echotik.MockVideos(p.Region, p.PageSize))}
	}
	raw, err := s.echo.GetVideoRanklist(ctx, p)
	if err != nil || len(raw) == 0 {
		return &EntityRanklistResult[VideoDTO]{State: "error", Rows: s.hostMapVideos(ctx, echotik.MockVideos(p.Region, p.PageSize))}
	}
	s.upsertVideoList(ctx, p.Region, raw)
	s.writeEntityRanklist(ctx, "video", p, videoIDsOf(raw))
	if res, ok := s.lookupVideoRanklist(ctx, p); ok {
		res.State = "live"
		return res
	}
	now := time.Now()
	return &EntityRanklistResult[VideoDTO]{State: "live", FetchedAt: &now, Rows: s.hostMapVideos(ctx, raw)}
}

func videoIDsOf(raw []echotik.VideoListItem) []string {
	ids := make([]string, 0, len(raw))
	for _, it := range raw {
		if it.VideoID != "" {
			ids = append(ids, it.VideoID)
		}
	}
	return ids
}
