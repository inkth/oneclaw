package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
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

// writeEntityRanklist upsert 一条榜单顺序快照:整表模式——每个
// (provider,kind,region,rank_type,rank_field,category_id) 一条,external_ids 累积全部已拉深度,
// 读侧 pageSlice 本地分页。page_num 固定 1,只作为唯一索引 uq_ere_pg 的键维度占位
// (ON CONFLICT 列必须与唯一索引完全一致,少列会整条写入报错——曾静默失败,故错误必打日志)。
//
// 防缩水:新列表只覆盖它够得着的前缀,既有更深的尾部保留。上游某天数据没出全、或跨境超时
// 只拉回几条时,绝不能把已存的完整榜单截断——曾致达人榜首页只剩 6 条并挂满一个 TTL。
func (s *DiscoverService) writeEntityRanklist(ctx context.Context, kind string, p echotik.RanklistParams, ids []string) {
	if s.db == nil || len(ids) == 0 {
		return
	}
	if existing, _, ok := s.lookupRanklistIDs(ctx, kind, p); ok && len(existing) > len(ids) {
		ids = mergeIDsAt(existing, ids, 0)
	}
	e := model.EntityRanklistEntry{
		Provider: providerEchoTik, Kind: kind, Region: p.Region,
		RankType: p.RankType, RankField: p.RankField, CategoryID: p.CategoryID,
		PageNum: 1, ExternalIDs: ids, FetchedAt: time.Now(),
	}
	err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "provider"}, {Name: "kind"}, {Name: "region"},
			{Name: "rank_type"}, {Name: "rank_field"}, {Name: "category_id"}, {Name: "page_num"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"external_ids", "fetched_at"}),
	}).Create(&e).Error
	if err != nil {
		logger.Warn("实体榜顺序表写入失败",
			logger.String("kind", kind), logger.String("region", p.Region), logger.Err(err))
	}
}

// mergeEntityRanklistPage 把单页 ids 合并进整表条目的对应区间(页外既有顺序保留,新页覆盖同区间)。
// 供按页粒度的 backfill 使用:避免「单页写入把 prewarm 已存的更深列表截断/覆盖」。
func (s *DiscoverService) mergeEntityRanklistPage(ctx context.Context, kind string, p echotik.RanklistParams, ids []string) {
	if len(ids) == 0 {
		return
	}
	existing, _, _ := s.lookupRanklistIDs(ctx, kind, p)
	start := (p.PageNum - 1) * p.PageSize
	s.writeEntityRanklist(ctx, kind, p, mergeIDsAt(existing, ids, start))
}

// mergeIDsAt 把 ids 覆盖到 existing 的 [start, start+len(ids)) 区间,区间外的既有顺序保留,
// 再去重保序(同一实体跨页重复时留首次出现位置)。start 超出既有长度时直接顺接(顺序近似)。
func mergeIDsAt(existing, ids []string, start int) []string {
	if start < 0 {
		start = 0
	}
	merged := make([]string, 0, len(existing)+len(ids))
	if len(existing) >= start {
		merged = append(merged, existing[:start]...)
	} else {
		merged = append(merged, existing...) // 中间页有洞:直接顺接,顺序近似
	}
	merged = append(merged, ids...)
	if len(existing) > start+len(ids) {
		merged = append(merged, existing[start+len(ids):]...)
	}
	seen := make(map[string]struct{}, len(merged))
	uniq := merged[:0]
	for _, id := range merged {
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	return uniq
}

// lookupRanklistIDs 读榜单顺序。不看 TTL(有就用):保证 EchoTik 不可用时榜单仍可读,新鲜由 job/异步补全保证。
func (s *DiscoverService) lookupRanklistIDs(ctx context.Context, kind string, p echotik.RanklistParams) ([]string, time.Time, bool) {
	if s.db == nil {
		return nil, time.Time{}, false
	}
	var e model.EntityRanklistEntry
	err := s.db.WithContext(ctx).
		Where("provider = ? AND kind = ? AND region = ? AND rank_type = ? AND rank_field = ? AND category_id = ? AND page_num = 1",
			providerEchoTik, kind, p.Region, p.RankType, p.RankField, p.CategoryID).
		First(&e).Error
	if err != nil || len(e.ExternalIDs) == 0 {
		return nil, time.Time{}, false
	}
	return e.ExternalIDs, e.FetchedAt, true
}

// ── 后台异步补全(读路径零同步 EchoTik) ────────────────────────────────────────

// entityStaleTTL 按实体类型给读路径 SWR 陈旧阈值:视频榜跟商品节奏(12h,爆款发现要快),
// 店铺/达人日更浏览数据放宽到 24h(与后台预热节奏对齐,避免用户访问把省下的请求打回去)。
func entityStaleTTL(kind string) time.Duration {
	if kind == "video" {
		return cacheTTL
	}
	return entitySlowTTL
}

// entityShortRetryTTL 首页不满一页时的重拉冷却:上游确实只有这么多(冷门类目)时,
// 不能每次访问都打一次跨境接口。
const entityShortRetryTTL = time.Hour

// warmEntityIfNeeded 命中后台保鲜判定:顺序表陈旧(>entityStaleTTL)、请求页超出已存深度、
// 或首页残缺(不足一页)→ 异步拉深。
func (s *DiscoverService) warmEntityIfNeeded(ctx context.Context, kind string, p echotik.RanklistParams, fetchedAt *time.Time, rowCount int) {
	if !s.echo.Configured() {
		return
	}
	stale := fetchedAt != nil && time.Since(*fetchedAt) > entityStaleTTL(kind)
	beyond := rowCount == 0 && p.PageNum > 1 // 请求页超出已存深度
	// 首页不足一页=顺序表被短结果截断、或主表缺行:不等满 TTL,按冷却重拉一次。
	short := p.PageNum == 1 && rowCount < p.PageSize &&
		fetchedAt != nil && time.Since(*fetchedAt) > entityShortRetryTTL
	if !stale && !beyond && !short {
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
	// 店铺榜:近7天窗口/累计权威值/在售商品数只有 seller/detail 有,榜单落库后顺带补详情
	// (24h TTL 内跳过,单轮限量)。放在顺序表写入之后,不挡榜单可读。
	if kind == "seller" {
		s.backfillSellerDetails(ctx, p.Region, allIDs)
	}
	return nil
}

// ── 店铺 ──────────────────────────────────────────────────────────────────────

// mapSellerFromModel 榜单/搜索行 DTO:累计值走详情权威口径(sellerAuthority,0=详情未回填),
// 近 7 天窗口读详情回填列,spark 由调用方批量差分传入。
// cat 由调用方按页取一次(词典是整页共用的,别逐行去查缓存)。
func mapSellerFromModel(ds model.DiscoverSeller, spark []int, cat categoryZhDict) SellerDTO {
	if spark == nil {
		spark = []int{}
	}
	sale, gmvCents, ifl, _, _, crawl := sellerAuthority(&ds)
	return SellerDTO{
		SellerID: ds.ExternalID, SellerName: ds.SellerName, Region: ds.Region,
		CoverURL: strPtrOrNil(ds.CoverURL), Rating: ds.Rating, Categories: cat.Names(parseCategories(ds.Categories)),
		Sale7dCnt: ds.Sale7dCnt, Gmv7dAmt: gmvCentsToDollars(ds.Gmv7dCents), Spark7d: spark,
		TotalSaleCnt: sale, TotalSaleGmvAmt: gmvCentsToDollars(gmvCents), TotalIflCnt: ifl,
		CrawlProductCnt: crawl,
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
	modelIDs := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		byID[r.ExternalID] = r
		modelIDs = append(modelIDs, r.ID)
	}
	sparks := s.loadSellerSparks(ctx, modelIDs)
	cat := s.categoryZh(ctx, p.Region)
	out := make([]SellerDTO, 0, len(pageIDs))
	for _, id := range pageIDs {
		if r, ok := byID[id]; ok {
			out = append(out, mapSellerFromModel(r, sparks[r.ID], cat))
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
		AvatarURL: strPtrOrNil(di.AvatarURL), Category: zhInfluencerCategory(di.Category), EcScore: di.EcScore,
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
