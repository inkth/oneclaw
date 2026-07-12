package service

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm/clause"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/echotik"
)

// 榜单读 DB 化:店铺/达人/视频榜 = EntityRanklistEntry 顺序 + 关联实体主表渲染(零 EchoTik)。
// 封面用主表已 rehost 的 COS 永久 URL。job(PrewarmEntities)/冷启动异步补全(warmEntityRanklist)写顺序表。
// 所有维度(任意类目/页)都读 DB;读路径绝不同步打 EchoTik,miss/陈旧/超深度走后台异步补。

func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func gmvCentsToDollars(cents int) float64 { return float64(cents) / 100.0 }

// writeEntityRanklist upsert 一条榜单顺序快照((provider,kind,region,rank_type,rank_field,category_id) 幂等)。
func (s *DiscoverService) writeEntityRanklist(ctx context.Context, kind string, p echotik.RanklistParams, ids []string) {
	if s.db == nil || len(ids) == 0 {
		return
	}
	e := model.EntityRanklistEntry{
		Provider: providerEchoTik, Kind: kind, Region: p.Region,
		RankType: p.RankType, RankField: p.RankField, CategoryID: p.CategoryID,
		ExternalIDs: ids, FetchedAt: time.Now(),
	}
	s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "provider"}, {Name: "kind"}, {Name: "region"},
			{Name: "rank_type"}, {Name: "rank_field"}, {Name: "category_id"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"external_ids", "fetched_at"}),
	}).Create(&e)
}

// lookupRanklistIDs 读榜单顺序。不看 TTL(有就用):保证 EchoTik 不可用时榜单仍可读,新鲜由 job/异步补全保证。
func (s *DiscoverService) lookupRanklistIDs(ctx context.Context, kind string, p echotik.RanklistParams) ([]string, time.Time, bool) {
	if s.db == nil {
		return nil, time.Time{}, false
	}
	var e model.EntityRanklistEntry
	err := s.db.WithContext(ctx).
		Where("provider = ? AND kind = ? AND region = ? AND rank_type = ? AND rank_field = ? AND category_id = ?",
			providerEchoTik, kind, p.Region, p.RankType, p.RankField, p.CategoryID).
		First(&e).Error
	if err != nil || len(e.ExternalIDs) == 0 {
		return nil, time.Time{}, false
	}
	return e.ExternalIDs, e.FetchedAt, true
}

// ── 后台异步补全(读路径零同步 EchoTik) ────────────────────────────────────────

// warmEntityIfNeeded 命中后台保鲜判定:顺序表陈旧(>cacheTTL)或请求页超出已存深度 → 异步拉深。
func (s *DiscoverService) warmEntityIfNeeded(ctx context.Context, kind string, p echotik.RanklistParams, fetchedAt *time.Time, rowCount int) {
	if !s.echo.Configured() {
		return
	}
	stale := fetchedAt != nil && time.Since(*fetchedAt) > cacheTTL
	beyond := rowCount == 0 && p.PageNum > 1 // 请求页超出已存深度
	if !stale && !beyond {
		return
	}
	depth := p.PageNum
	if depth < defaultRanklistDepth {
		depth = defaultRanklistDepth
	}
	s.warmEntityRanklist(ctx, kind, p, depth)
}

// warmEntityRanklist 后台异步拉取某类实体榜前 upto 页并落库(非阻塞,不随请求 ctx 取消)。
func (s *DiscoverService) warmEntityRanklist(ctx context.Context, kind string, p echotik.RanklistParams, upto int) {
	if !s.echo.Configured() {
		return
	}
	goRefresh(ctx, "entity-ranklist-"+kind, func(bg context.Context) {
		if err := s.prewarmEntityKind(bg, kind, p, upto); err != nil {
			logger.Warn("实体榜后台拉取失败",
				logger.String("kind", kind), logger.String("region", p.Region), logger.Err(err))
		}
	})
}

// fetchEntityPage 拉取某类实体榜一页 + upsert 主表,返回该页有序 ID 与条数。
func (s *DiscoverService) fetchEntityPage(ctx context.Context, kind string, p echotik.RanklistParams) ([]string, int, error) {
	switch kind {
	case "seller":
		raw, err := s.echo.GetSellerRanklist(ctx, p)
		if err != nil {
			return nil, 0, err
		}
		s.upsertSellerList(ctx, p.Region, raw)
		return sellerIDsOf(raw), len(raw), nil
	case "influencer":
		raw, err := s.echo.GetInfluencerRanklist(ctx, p)
		if err != nil {
			return nil, 0, err
		}
		s.upsertInfluencerList(ctx, p.Region, raw)
		return influencerIDsOf(raw), len(raw), nil
	case "video":
		raw, err := s.echo.GetVideoRanklist(ctx, p)
		if err != nil {
			return nil, 0, err
		}
		s.upsertVideoList(ctx, p.Region, raw)
		return videoIDsOf(raw), len(raw), nil
	}
	return nil, 0, fmt.Errorf("未知实体类型 %s", kind)
}

// prewarmEntityKind 同步拉取某类实体榜前 upto 页并累积落库(主表 + 顺序表)。供 job/backfill/异步补全调用。
func (s *DiscoverService) prewarmEntityKind(ctx context.Context, kind string, p echotik.RanklistParams, upto int) error {
	if !s.echo.Configured() {
		return nil
	}
	if p.PageSize <= 0 {
		p.PageSize = 20
	}
	if upto < 1 {
		upto = 1
	}
	var allIDs []string
	seen := make(map[string]struct{})
	for page := 1; page <= upto; page++ {
		pp := p
		pp.PageNum = page
		ids, n, err := s.fetchEntityPage(ctx, kind, pp)
		if err != nil {
			if page == 1 {
				return err
			}
			break // 部分深度可接受
		}
		if n == 0 {
			break
		}
		for _, id := range ids {
			if _, dup := seen[id]; !dup {
				seen[id] = struct{}{}
				allIDs = append(allIDs, id)
			}
		}
		if n < p.PageSize {
			break // 不足一页=没有更多
		}
	}
	if len(allIDs) > 0 {
		s.writeEntityRanklist(ctx, kind, p, allIDs)
	}
	return nil
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
	pageIDs := pageSlice(ids, p.PageNum, p.PageSize)
	var rows []model.DiscoverSeller
	if len(pageIDs) > 0 {
		s.db.WithContext(ctx).
			Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, p.Region, pageIDs).
			Find(&rows)
	}
	byID := make(map[string]model.DiscoverSeller, len(rows))
	for _, r := range rows {
		byID[r.ExternalID] = r
	}
	out := make([]SellerDTO, 0, len(pageIDs))
	for _, id := range pageIDs {
		if r, ok := byID[id]; ok {
			out = append(out, mapSellerFromModel(r))
		}
	}
	at := fetchedAt
	return &EntityRanklistResult[SellerDTO]{State: "cached", FetchedAt: &at, Warming: len(out) == 0 && s.echo.Configured(), Rows: out}, true
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
	pageIDs := pageSlice(ids, p.PageNum, p.PageSize)
	var rows []model.DiscoverInfluencer
	if len(pageIDs) > 0 {
		s.db.WithContext(ctx).
			Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, p.Region, pageIDs).
			Find(&rows)
	}
	byID := make(map[string]model.DiscoverInfluencer, len(rows))
	for _, r := range rows {
		byID[r.ExternalID] = r
	}
	out := make([]InfluencerDTO, 0, len(pageIDs))
	for _, id := range pageIDs {
		if r, ok := byID[id]; ok {
			out = append(out, mapInfluencerFromModel(r))
		}
	}
	at := fetchedAt
	return &EntityRanklistResult[InfluencerDTO]{State: "cached", FetchedAt: &at, Warming: len(out) == 0 && s.echo.Configured(), Rows: out}, true
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
	pageIDs := pageSlice(ids, p.PageNum, p.PageSize)
	var rows []model.DiscoverVideo
	if len(pageIDs) > 0 {
		s.db.WithContext(ctx).
			Where("provider = ? AND region = ? AND external_id IN ?", providerEchoTik, p.Region, pageIDs).
			Find(&rows)
	}
	byID := make(map[string]model.DiscoverVideo, len(rows))
	for _, r := range rows {
		byID[r.ExternalID] = r
	}
	out := make([]VideoDTO, 0, len(pageIDs))
	for _, id := range pageIDs {
		if r, ok := byID[id]; ok {
			out = append(out, mapVideoFromModel(r))
		}
	}
	at := fetchedAt
	return &EntityRanklistResult[VideoDTO]{State: "cached", FetchedAt: &at, Warming: len(out) == 0 && s.echo.Configured(), Rows: out}, true
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
