package service

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"

	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// ── DTO ──────────────────────────────────────────────────────────────────────

// ProductDetailDTO 选品详情页用:基础榜单字段 + 详情扩展 + 达人/视频/趋势 + 选品诊断评分。
type ProductDetailDTO struct {
	DecoratedProduct                        // 基础(已含 coverUrls/importedProductId/interaction)
	Rating           float64                `json:"rating"`
	ReviewCount      int                    `json:"reviewCount"`
	Discount         string                 `json:"discount"`
	FreeShipping     bool                   `json:"freeShipping"`
	Description      string                 `json:"description"`
	Windows          *WindowsDTO            `json:"windows"`
	Influencers      []ProductInfluencerDTO `json:"influencers"`
	Videos           []ProductVideoDTO      `json:"videos"`
	Trend            []TrendPointDTO        `json:"trend"`
	Score            *ScoreDTO              `json:"score"`
}

// WindowsDTO 近 7/30/90 天窗口指标(金额 cents)。
type WindowsDTO struct {
	Sale7dCnt   int `json:"sale7dCnt"`
	Sale30dCnt  int `json:"sale30dCnt"`
	Sale90dCnt  int `json:"sale90dCnt"`
	Gmv7dCents  int `json:"gmv7dCents"`
	Gmv30dCents int `json:"gmv30dCents"`
	Video7dCnt  int `json:"video7dCnt"`
	Video30dCnt int `json:"video30dCnt"`
}

type ProductInfluencerDTO struct {
	UserID             string `json:"userId"`
	NickName           string `json:"nickName"`
	Avatar             string `json:"avatar"` // 已签名
	Category           string `json:"category"`
	Followers          int    `json:"followers"`
	PerProductGmvCents int    `json:"perProductGmvCents"`
	PerProductSaleCnt  int    `json:"perProductSaleCnt"`
}

type ProductVideoDTO struct {
	VideoID      string `json:"videoId"`
	Cover        string `json:"cover"` // 已签名
	Desc         string `json:"desc"`
	PlayAddr     string `json:"playAddr"`
	CreateTime   string `json:"createTime"`
	Views        int    `json:"views"`
	Digg         int    `json:"digg"`
	Comments     int    `json:"comments"`
	Shares       int    `json:"shares"`
	SaleCnt      int    `json:"saleCnt"`
	SaleGmvCents int    `json:"saleGmvCents"`
}

type TrendPointDTO struct {
	Dt       string `json:"dt"`
	SaleCnt  int    `json:"saleCnt"`  // 当日增量
	GmvCents int    `json:"gmvCents"` // 当日增量
}

type ScoreDTO struct {
	Score   int         `json:"score"` // 0-100
	Verdict string      `json:"verdict"`
	Signals []SignalDTO `json:"signals"`
}

type SignalDTO struct {
	Key   string `json:"key"` // momentum/margin/competition/quality
	Label string `json:"label"`
	Tone  string `json:"tone"` // success/info/warning/danger/neutral
	Value string `json:"value"`
	Hint  string `json:"hint"`
}

// detailExtras 是 pdetail 缓存的内容(详情扩展 + 签名图廊)。
type detailExtras struct {
	Gallery      []string    `json:"gallery"`
	Rating       float64     `json:"rating"`
	ReviewCount  int         `json:"reviewCount"`
	Discount     string      `json:"discount"`
	FreeShipping bool        `json:"freeShipping"`
	Description  string      `json:"description"`
	Windows      *WindowsDTO `json:"windows"`

	// 累计总量(权威值,覆盖榜单行的窗口/排名口径)。
	TotalSaleCnt  int `json:"totalSaleCnt"`
	TotalGmvCents int `json:"totalGmvCents"`
	TotalIflCnt   int `json:"totalIflCnt"`
	TotalVideoCnt int `json:"totalVideoCnt"`
	TotalLiveCnt  int `json:"totalLiveCnt"`
}

// ── 入口 ─────────────────────────────────────────────────────────────────────

// productDetailTTL 选品详情级数据新鲜期(详情慢变;陈旧走 SWR 后台刷)。
const productDetailTTL = 12 * time.Hour

// ProductDetailFull 组装选品详情:基础(DB)+ 详情扩展/达人/视频(DB,按条件刷新)+ 趋势(本地快照差分)+ 评分。
// 读 DB 优先,零 EchoTik;详情陈旧走 stale-while-revalidate 后台刷,首见同步刷一次并落库。
func (s *DiscoverService) ProductDetailFull(ctx context.Context, wsID uuid.UUID, externalID, region string) (*ProductDetailDTO, error) {
	dp, err := s.findDiscover(ctx, externalID, region)
	if err != nil {
		return nil, err
	}
	base := s.decorate(ctx, wsID, []model.DiscoverProduct{*dp})[0]
	dto := &ProductDetailDTO{DecoratedProduct: base}
	trend := s.productTrendFromSnapshots(ctx, dp.ID)

	hasDetail := !dp.DetailFetchedAt.IsZero()
	fresh := hasDetail && time.Since(dp.DetailFetchedAt) < productDetailTTL

	var extras *detailExtras
	if fresh || hasDetail || !s.echo.Configured() {
		// 新鲜 / SWR 旧值 / 未配置降级:全部读 DB。
		extras = parseProductExtras(dp.DetailExtras)
		dto.Influencers = parseProductInfluencers(dp.DetailInfluencers)
		dto.Videos = parseProductVideos(dp.DetailVideos)
		if !fresh && hasDetail && s.echo.Configured() {
			goRefresh(ctx, "product-detail", func(bg context.Context) {
				if _, _, _, e := s.refreshProductDetail(bg, externalID, region); e != nil {
					logger.Warn("选品详情后台刷新失败", logger.String("id", externalID), logger.Err(e))
				}
			})
		}
	} else {
		// 首见:同步刷一次并落库。
		ex, infls, vids, e := s.refreshProductDetail(ctx, externalID, region)
		if e == nil {
			extras, dto.Influencers, dto.Videos = ex, infls, vids
		}
	}

	if extras != nil {
		if len(extras.Gallery) > 0 {
			dto.CoverUrls = extras.Gallery // 完整图廊覆盖列表单图
		}
		dto.Rating = extras.Rating
		dto.ReviewCount = extras.ReviewCount
		dto.Discount = extras.Discount
		dto.FreeShipping = extras.FreeShipping
		dto.Description = extras.Description
		dto.Windows = extras.Windows
		// 用详情的累计口径覆盖榜单行的窗口/排名口径(后者与「近7天」窗口会自相矛盾)。
		if extras.TotalVideoCnt > 0 || extras.TotalSaleCnt > 0 {
			dto.TotalSaleCnt = extras.TotalSaleCnt
			dto.TotalSaleGmvCents = extras.TotalGmvCents
			dto.TotalIflCnt = extras.TotalIflCnt
			dto.TotalVideoCnt = extras.TotalVideoCnt
		}
	}
	if dto.Influencers == nil {
		dto.Influencers = []ProductInfluencerDTO{}
	}
	if dto.Videos == nil {
		dto.Videos = []ProductVideoDTO{}
	}
	dto.Trend = trend
	dto.Score = s.scoreProduct(dp, extras, trend)
	return dto, nil
}

// ── 详情子资源(拉取 + 永久化 + 落库) ──────────────────────────────────────────

// refreshProductDetail 并行拉详情扩展/带货达人/带货视频,封面 rehost 到 COS 永久化,落库 DiscoverProduct
// 详情字段。趋势不在此取(走 DiscoverSnapshot 差分)。任一子资源失败只影响该块,全失败才返回 error。
func (s *DiscoverService) refreshProductDetail(ctx context.Context, id, region string) (*detailExtras, []ProductInfluencerDTO, []ProductVideoDTO, error) {
	var (
		extras *detailExtras
		infls  []ProductInfluencerDTO
		vids   []ProductVideoDTO
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error { extras = s.fetchProductExtras(gctx, id, region); return nil })
	g.Go(func() error { infls = s.fetchProductInfluencers(gctx, id, region); return nil })
	g.Go(func() error { vids = s.fetchProductVideos(gctx, id, region); return nil })
	_ = g.Wait()
	if extras == nil && len(infls) == 0 && len(vids) == 0 {
		return nil, nil, nil, errors.New("选品详情子资源全部拉取失败")
	}
	s.persistProductDetail(ctx, id, region, extras, infls, vids)
	return extras, infls, vids, nil
}

func (s *DiscoverService) fetchProductExtras(ctx context.Context, id, region string) *detailExtras {
	d, err := s.echo.GetProductDetail(ctx, id, region)
	if err != nil || d == nil {
		if err != nil {
			logger.Warn("选品详情:取详情失败", logger.String("id", id), logger.Err(err))
		}
		return nil
	}
	covers := echotik.ParseCovers(d.CoverURL)
	raws := make([]string, 0, len(covers))
	for _, cv := range covers {
		raws = append(raws, cv.URL)
	}
	hosted := s.rehostCovers(ctx, raws) // 图廊永久化到 COS
	gallery := make([]string, 0, len(raws))
	for _, r := range raws {
		if u := hosted[r]; u != "" {
			gallery = append(gallery, u)
		}
	}
	return &detailExtras{
		Gallery:      gallery,
		Rating:       d.ProductRating.Float(),
		ReviewCount:  d.ReviewCount.Int(),
		Discount:     string(d.Discount),
		FreeShipping: d.FreeShipping.Int() == 1,
		Description:  parseDescDetail(d.DescDetail),
		Windows: &WindowsDTO{
			Sale7dCnt:   d.TotalSale7dCnt.Int(),
			Sale30dCnt:  d.TotalSale30dCnt.Int(),
			Sale90dCnt:  d.TotalSale90dCnt.Int(),
			Gmv7dCents:  echotik.DollarsToCents(d.TotalSaleGmv7dAmt.Float()),
			Gmv30dCents: echotik.DollarsToCents(d.TotalSaleGmv30dAmt.Float()),
			Video7dCnt:  d.TotalVideo7dCnt.Int(),
			Video30dCnt: d.TotalVideo30dCnt.Int(),
		},
		TotalSaleCnt:  d.TotalSaleCnt.Int(),
		TotalGmvCents: echotik.DollarsToCents(d.TotalSaleGmvAmt.Float()),
		TotalIflCnt:   d.TotalIflCnt.Int(),
		TotalVideoCnt: d.TotalVideoCnt.Int(),
		TotalLiveCnt:  d.TotalLiveCnt.Int(),
	}
}

func (s *DiscoverService) fetchProductInfluencers(ctx context.Context, id, region string) []ProductInfluencerDTO {
	rows, err := s.echo.GetProductInfluencers(ctx, id, region, 10)
	if err != nil {
		logger.Warn("选品详情:取达人失败", logger.String("id", id), logger.Err(err))
		return nil
	}
	avatars := make([]string, 0, len(rows))
	for _, r := range rows {
		avatars = append(avatars, r.Avatar)
	}
	hosted := s.rehostCovers(ctx, avatars)
	out := make([]ProductInfluencerDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, ProductInfluencerDTO{
			UserID:             r.UserID,
			NickName:           r.NickName,
			Avatar:             hosted[r.Avatar],
			Category:           r.Category,
			Followers:          r.TotalFollowersCnt.Int(),
			PerProductGmvCents: echotik.DollarsToCents(r.PerProductGmvAmt.Float()),
			PerProductSaleCnt:  r.PerProductSaleCnt.Int(),
		})
	}
	return out
}

func (s *DiscoverService) fetchProductVideos(ctx context.Context, id, region string) []ProductVideoDTO {
	rows, err := s.echo.GetProductVideos(ctx, id, region, 10)
	if err != nil {
		logger.Warn("选品详情:取视频失败", logger.String("id", id), logger.Err(err))
		return nil
	}
	covers := make([]string, 0, len(rows))
	for _, r := range rows {
		covers = append(covers, r.ReflowCover)
	}
	hosted := s.rehostCovers(ctx, covers)
	out := make([]ProductVideoDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, ProductVideoDTO{
			VideoID:      r.VideoID,
			Cover:        hosted[r.ReflowCover],
			Desc:         r.VideoDesc,
			PlayAddr:     r.PlayAddr,
			CreateTime:   string(r.CreateTime),
			Views:        r.TotalViewsCnt.Int(),
			Digg:         r.TotalDiggCnt.Int(),
			Comments:     r.TotalCommentsCnt.Int(),
			Shares:       r.TotalSharesCnt.Int(),
			SaleCnt:      r.TotalVideoSaleCnt.Int(),
			SaleGmvCents: echotik.DollarsToCents(r.TotalVideoSaleGmv.Float()),
		})
	}
	return out
}

// persistProductDetail 落库详情子资源(仅更新本轮拿到的块 + detail_fetched_at)。
func (s *DiscoverService) persistProductDetail(ctx context.Context, id, region string, extras *detailExtras, infls []ProductInfluencerDTO, vids []ProductVideoDTO) {
	if s.db == nil {
		return
	}
	updates := map[string]any{"detail_fetched_at": time.Now()}
	if extras != nil {
		if b, e := json.Marshal(extras); e == nil {
			updates["detail_extras"] = model.JSONB(b)
		}
	}
	if infls != nil {
		if b, e := json.Marshal(infls); e == nil {
			updates["detail_influencers"] = model.JSONB(b)
		}
	}
	if vids != nil {
		if b, e := json.Marshal(vids); e == nil {
			updates["detail_videos"] = model.JSONB(b)
		}
	}
	s.db.WithContext(ctx).Model(&model.DiscoverProduct{}).
		Where("provider = ? AND external_id = ? AND region = ?", providerEchoTik, id, region).
		Updates(updates)
}

// productTrendFromSnapshots 商品趋势:本地每日累计快照差分(突破 EchoTik trend 14 天限制)。
func (s *DiscoverService) productTrendFromSnapshots(ctx context.Context, productID uuid.UUID) []TrendPointDTO {
	if s.db == nil || productID == uuid.Nil {
		return []TrendPointDTO{}
	}
	var snaps []model.DiscoverSnapshot
	if err := s.db.WithContext(ctx).
		Where("discover_product_id = ?", productID).
		Order("dt asc").Find(&snaps).Error; err != nil {
		return []TrendPointDTO{}
	}
	return diffProductTrend(snaps)
}

// diffProductTrend 累计快照差分成日增量趋势点(纯函数)。首点无前值留 0,口径回退归 0。
func diffProductTrend(snaps []model.DiscoverSnapshot) []TrendPointDTO {
	out := make([]TrendPointDTO, 0, len(snaps))
	for i, sn := range snaps {
		pt := TrendPointDTO{Dt: sn.Dt}
		if i > 0 {
			prev := snaps[i-1]
			pt.SaleCnt = nonNeg(sn.TotalSaleCnt - prev.TotalSaleCnt)
			pt.GmvCents = nonNeg(sn.TotalSaleGmv - prev.TotalSaleGmv)
		}
		out = append(out, pt)
	}
	return out
}

func parseProductExtras(raw model.JSONB) *detailExtras {
	if len(raw) == 0 {
		return nil
	}
	var ex detailExtras
	if json.Unmarshal(raw, &ex) != nil {
		return nil
	}
	return &ex
}

func parseProductInfluencers(raw model.JSONB) []ProductInfluencerDTO {
	out := []ProductInfluencerDTO{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

func parseProductVideos(raw model.JSONB) []ProductVideoDTO {
	out := []ProductVideoDTO{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

// ── 选品诊断评分(规则化) ──────────────────────────────────────────────────────

func (s *DiscoverService) scoreProduct(dp *model.DiscoverProduct, ex *detailExtras, trend []TrendPointDTO) *ScoreDTO {
	signals := make([]SignalDTO, 0, 4)

	// 1. 势头 momentum:看近 7 天日增量销量的前后段对比。
	mSub, mSig := momentumSignal(trend)
	signals = append(signals, mSig)

	// 2. 利润 margin:按品类/市场估算落地成本(货价+物流)再扣佣金。
	cb := echotik.EstimateLandedCost(dp.AvgPriceCents, dp.Name, dp.Region)
	grossPct := echotik.EstimateMarginPct(dp.AvgPriceCents, cb.TotalCents)
	netPct := float64(grossPct) - dp.CommissionRate*100
	marginSub := clamp01((netPct - 20) / 50) // 20%→0,70%→1
	marginTone := "success"
	if netPct < 35 {
		marginTone = "danger"
	} else if netPct < 50 {
		marginTone = "warning"
	}
	signals = append(signals, SignalDTO{
		Key: "margin", Label: "利润空间", Tone: marginTone,
		Value: itoaPct(netPct),
		Hint: "估算落地成本(「" + cb.Archetype + "」货价≈" + itoaPct(cb.GoodsRatio*100) +
			" + 物流≈" + itoaPct(cb.LogisticsRatio*100) + "),已扣佣金 " + itoaPct(dp.CommissionRate*100) + ";建议导入后回填真实进货价",
	})

	// 3. 竞争饱和度 competition:用累计带货视频数当代理(优先详情的权威口径)。
	video := dp.TotalVideoCnt
	ifl := dp.TotalIflCnt
	if ex != nil && ex.TotalVideoCnt > 0 {
		video = ex.TotalVideoCnt
		ifl = ex.TotalIflCnt
	}
	var compSub float64
	var compTone, compVal string
	switch {
	case video < 2000:
		compSub, compTone, compVal = 1.0, "success", "蓝海"
	case video < 15000:
		compSub, compTone, compVal = 0.6, "info", "适中"
	default:
		compSub, compTone, compVal = 0.3, "warning", "红海"
	}
	signals = append(signals, SignalDTO{
		Key: "competition", Label: "竞争饱和", Tone: compTone, Value: compVal,
		Hint: "已有 " + humanInt(video) + " 条带货视频、" + humanInt(ifl) + " 个达人在带",
	})

	// 4. 口碑 quality:评分 + 评价数。
	rating := 0.0
	reviews := 0
	if ex != nil {
		rating = ex.Rating
		reviews = ex.ReviewCount
	}
	qSub := clamp01((rating - 3.0) / 1.8) // 3.0→0,4.8→1
	qTone := "neutral"
	qVal := "暂无"
	if rating > 0 {
		qVal = ftoa1(rating) + " 分"
		switch {
		case rating >= 4.5:
			qTone = "success"
		case rating >= 4.0:
			qTone = "info"
		case rating >= 3.5:
			qTone = "warning"
		default:
			qTone = "danger"
		}
	} else {
		qSub = 0.5 // 无数据按中性
	}
	signals = append(signals, SignalDTO{
		Key: "quality", Label: "口碑评分", Tone: qTone, Value: qVal,
		Hint: humanInt(reviews) + " 条评价",
	})

	score := int(math.Round(30*mSub + 25*marginSub + 20*compSub + 25*qSub))
	if score > 100 {
		score = 100
	}
	return &ScoreDTO{Score: score, Verdict: verdict(score, mSig.Value, compVal), Signals: signals}
}

func momentumSignal(trend []TrendPointDTO) (float64, SignalDTO) {
	sig := SignalDTO{Key: "momentum", Label: "销量势头", Tone: "neutral", Value: "数据不足", Hint: "近 14 天日增量销量趋势"}
	if len(trend) < 4 {
		return 0.5, sig
	}
	n := len(trend)
	half := n / 2
	earlier := avgSale(trend[:half])
	recent := avgSale(trend[half:])
	if earlier <= 0 {
		return 0.5, sig
	}
	ratio := recent / earlier
	switch {
	case ratio >= 1.15:
		sig.Tone, sig.Value = "success", "上升"
		return 1.0, sig
	case ratio >= 0.9:
		sig.Tone, sig.Value = "info", "平稳"
		return 0.6, sig
	case ratio >= 0.7:
		sig.Tone, sig.Value = "warning", "放缓"
		return 0.35, sig
	default:
		sig.Tone, sig.Value = "danger", "下滑"
		return 0.2, sig
	}
}

func avgSale(pts []TrendPointDTO) float64 {
	if len(pts) == 0 {
		return 0
	}
	sum := 0
	for _, p := range pts {
		sum += p.SaleCnt
	}
	return float64(sum) / float64(len(pts))
}

func verdict(score int, momentum, competition string) string {
	switch {
	case score >= 75:
		return "值得一试 — 综合表现优秀(势头" + momentum + "、" + competition + "),建议尽快测款。"
	case score >= 55:
		return "可考虑 — 有机会但需注意" + competition + "竞争与利润,建议小批量测试。"
	default:
		return "谨慎 — 综合信号偏弱(势头" + momentum + "、" + competition + "),除非有差异化打法否则不建议跟。"
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func itoaPct(v float64) string { return ftoa1(v) + "%" }

// ftoa1 保留 1 位小数并去掉多余的 .0。
func ftoa1(v float64) string {
	return strconv.FormatFloat(math.Round(v*10)/10, 'f', -1, 64)
}

func humanInt(n int) string {
	switch {
	case n >= 1_000_000:
		return ftoa1(float64(n)/1_000_000) + "M"
	case n >= 1_000:
		return ftoa1(float64(n)/1_000) + "K"
	default:
		return strconv.Itoa(n)
	}
}

// 解析 desc_detail(stringified JSON 富文本块 [{type,text},...])为纯文本,截断 280 字。
func parseDescDetail(raw string) string {
	if raw == "" {
		return ""
	}
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal([]byte(raw), &blocks); err != nil {
		return ""
	}
	var sb strings.Builder
	for _, b := range blocks {
		if b.Type == "text" && b.Text != "" {
			if sb.Len() > 0 {
				sb.WriteString(" ")
			}
			sb.WriteString(strings.TrimSpace(b.Text))
		}
	}
	out := strings.TrimSpace(sb.String())
	if len([]rune(out)) > 280 {
		out = string([]rune(out)[:280]) + "…"
	}
	return out
}
