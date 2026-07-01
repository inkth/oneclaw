package service

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"

	"golang.org/x/sync/errgroup"
	"gorm.io/gorm/clause"

	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

// coverLegacyHost 是 EchoTik 防盗链图床域名;cover_urls 里若含它,说明存的还是旧的
// 签名 URL(3 天过期),不是 COS 永久 URL,需回填。
const coverLegacyHost = "echosell-images"

// BackfillCovers 一次性回填存量商品封面:把 cover_urls 为空、或仍指向 EchoTik 防盗链签名 URL
// (会 3 天过期)的行,重新经 product/detail 取原文 → rehostCovers 永久化到 COS。
//
// 为什么需要它:读路径「商品榜不看 TTL」+ 只对被访问/预热的榜单后台刷新,对类目/搜索来的旧行、
// 或 rehostCovers 上线前入库的旧行不会自愈,封面会一直空(前端露首字母占位)。此命令一次扫平。
// 已是 COS 永久 URL 的行不动。用法:docker compose run --rm go-api ./server --backfill-covers
func (s *DiscoverService) BackfillCovers(ctx context.Context) (updated, skipped int, err error) {
	if s.echo == nil || !s.echo.Configured() {
		return 0, 0, fmt.Errorf("echotik 未配置,无法回填封面")
	}

	var rows []model.DiscoverProduct
	if e := s.db.WithContext(ctx).
		Where("provider = ?", providerEchoTik).
		Where("cover_urls IS NULL OR cover_urls::text = '[]' OR cover_urls::text LIKE ?", "%"+coverLegacyHost+"%").
		Order("region").
		Find(&rows).Error; e != nil {
		return 0, 0, e
	}
	if len(rows) == 0 {
		logger.Info("封面回填:无候选行,跳过")
		return 0, 0, nil
	}

	byRegion := map[string][]model.DiscoverProduct{}
	for _, r := range rows {
		byRegion[r.Region] = append(byRegion[r.Region], r)
	}
	logger.Info("封面回填开始", logger.Int("rows", len(rows)), logger.Int("regions", len(byRegion)))

	const batch = 30 // GetProductCovers 内部再按 10 子批;单批失败只影响这 30 个,不拖垮整体
	for region, list := range byRegion {
		for i := 0; i < len(list); i += batch {
			end := i + batch
			if end > len(list) {
				end = len(list)
			}
			chunk := list[i:end]
			items := make([]echotik.ProductListItem, len(chunk))
			for j, dp := range chunk {
				items[j] = echotik.ProductListItem{ProductID: dp.ExternalID}
			}
			// 复用榜单同款永久化链路:product/detail 取防盗链原文 → rehostCovers → COS。
			coverByID := s.enrichCovers(ctx, region, items)
			for _, dp := range chunk {
				cov, ok := coverByID[dp.ExternalID]
				if !ok || len(cov) == 0 {
					skipped++ // 详情查不到封面 / 上游失败,留待下次
					continue
				}
				if e := s.db.WithContext(ctx).Model(&model.DiscoverProduct{}).
					Where("id = ?", dp.ID).
					Update("cover_urls", cov).Error; e != nil {
					logger.Warn("封面回填落库失败", logger.String("externalId", dp.ExternalID), logger.Err(e))
					skipped++
					continue
				}
				updated++
			}
			logger.Info("封面回填进度", logger.String("region", region),
				logger.Int("updated", updated), logger.Int("skipped", skipped))
		}
	}
	return updated, skipped, nil
}

// coverAssetHits 查 cover_asset:已永久化的 rawURL 直接给 COS 永久 URL(填进 hits),其余作为 pending 返回。
// rehostCovers(同步转存)与 hostCoversAsync(读路径快速返回)共用,保证去重口径一致。
func (s *DiscoverService) coverAssetHits(ctx context.Context, uniq []string, hashByRaw map[string]string) (hits map[string]string, pending []string) {
	hits = make(map[string]string, len(uniq))
	if s.db == nil {
		return hits, uniq
	}
	hashes := make([]string, 0, len(uniq))
	for _, u := range uniq {
		hashes = append(hashes, hashByRaw[u])
	}
	var assets []model.CoverAsset
	s.db.WithContext(ctx).Where("raw_hash IN ?", hashes).Find(&assets)
	cosByHash := make(map[string]string, len(assets))
	for _, a := range assets {
		if a.CosURL != "" {
			cosByHash[a.RawHash] = a.CosURL
		}
	}
	pending = make([]string, 0, len(uniq))
	for _, u := range uniq {
		if cos, ok := cosByHash[hashByRaw[u]]; ok {
			hits[u] = cos
		} else {
			pending = append(pending, u)
		}
	}
	return hits, pending
}

// coverRehostWorkers 封面转存后台 worker 数;与榜单多页拉取同量级,统一限速防 EchoTik 429。
const coverRehostWorkers = 3

// StartCoverRehost 启动封面转存后台 worker;ctx 为应用生命周期(非请求 ctx),取消即退出。
func (s *DiscoverService) StartCoverRehost(ctx context.Context) {
	for i := 0; i < coverRehostWorkers; i++ {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case urls := <-s.rehostCh:
					s.rehostCovers(ctx, urls) // 副作用:落 cover_asset + 传 COS,下次读即命中永久 URL
					s.clearInflight(urls)
				}
			}
		}()
	}
	logger.Info("[job] 封面转存 worker 已启动", logger.Int("workers", coverRehostWorkers))
}

// enqueueRehost 非阻塞投递待转存 rawURL;inflight 跨请求去重,channel 满则丢弃(下次访问会再触发)。
func (s *DiscoverService) enqueueRehost(rawURLs []string) {
	if s.rehostCh == nil || len(rawURLs) == 0 {
		return
	}
	s.rehostMu.Lock()
	todo := make([]string, 0, len(rawURLs))
	for _, u := range rawURLs {
		if u == "" {
			continue
		}
		if _, ok := s.rehostInflight[u]; ok {
			continue
		}
		s.rehostInflight[u] = struct{}{}
		todo = append(todo, u)
	}
	s.rehostMu.Unlock()
	if len(todo) == 0 {
		return
	}
	select {
	case s.rehostCh <- todo:
	default:
		s.clearInflight(todo) // 队列满,放弃这批(不阻塞调用方)
	}
}

func (s *DiscoverService) clearInflight(urls []string) {
	s.rehostMu.Lock()
	for _, u := range urls {
		delete(s.rehostInflight, u)
	}
	s.rehostMu.Unlock()
}

// hostCoversAsync 读路径(搜索/榜单 live 兜底)用:立即返回可用封面 URL,不阻塞在下载转存上。
//   - 已永久化(cover_asset 命中)→ 直接给 COS 永久 URL。
//   - 未永久化 → 先给 3 天签名 URL 兜住本次展示,并投递后台 worker 转存,下次访问即 COS。
func (s *DiscoverService) hostCoversAsync(ctx context.Context, rawURLs []string) map[string]string {
	out := map[string]string{}
	seen := map[string]bool{}
	uniq := make([]string, 0, len(rawURLs))
	for _, u := range rawURLs {
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		uniq = append(uniq, u)
	}
	if len(uniq) == 0 {
		return out
	}
	hashByRaw := make(map[string]string, len(uniq))
	for _, u := range uniq {
		hashByRaw[u] = coverHash(u)
	}
	hits, pending := s.coverAssetHits(ctx, uniq, hashByRaw)
	for u, cos := range hits {
		out[u] = cos
	}
	if len(pending) == 0 {
		return out
	}
	// 未永久化:签名兜本次展示(快,单批接口无下载)+ 投递后台转存。
	signed := s.echo.SignCovers(ctx, pending)
	for _, u := range pending {
		if su := signed[u]; su != "" {
			out[u] = su
		}
	}
	s.enqueueRehost(pending)
	return out
}

// rehostCovers 把 EchoTik 防盗链原始封面 URL 永久化到自有 COS,返回 rawURL -> 可用 URL。
//
// 治本要点(替代原来"只签名、3 天过期"的方案):
//   - 命中 cover_asset 缓存的图直接复用 COS URL,免重复下载(四榜跨 region/时间全局去重)。
//   - 未永久化的:先签名(仅 signHost 防盗链图可签)拿到可下载 URL → 下载 → 上传 COS → 落 cover_asset。
//   - COS 未配置 / 下载 / 上传任一步失败 → 回退到签名 URL(signHost 图仍可用 3 天),严格不退化于原方案。
//
// 任一步出错只影响单张封面(前端走占位图),不阻断榜单返回。
func (s *DiscoverService) rehostCovers(ctx context.Context, rawURLs []string) map[string]string {
	out := map[string]string{}

	// 去重 + 去空。
	seen := map[string]bool{}
	uniq := make([]string, 0, len(rawURLs))
	for _, u := range rawURLs {
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		uniq = append(uniq, u)
	}
	if len(uniq) == 0 {
		return out
	}

	hashByRaw := make(map[string]string, len(uniq))
	for _, u := range uniq {
		hashByRaw[u] = coverHash(u)
	}

	// 1. 查 cover_asset 缓存:已永久化的直接复用,免下载。
	hits, pending := s.coverAssetHits(ctx, uniq, hashByRaw)
	for u, cos := range hits {
		out[u] = cos
	}
	if len(pending) == 0 {
		return out
	}

	// 2. 签名(只有 signHost 图能签),拿到可下载 URL,同时作为永久化失败时的回退。
	signed := s.echo.SignCovers(ctx, pending)

	// COS 未配置:直接回退签名 URL,行为等同原方案。
	if s.storage == nil || !s.storage.Configured() {
		for _, u := range pending {
			if su := signed[u]; su != "" {
				out[u] = su
			}
		}
		return out
	}

	// 3. 并发下载 + 上传 COS。
	type result struct {
		raw      string
		cos      string
		fallback string
	}
	results := make([]result, len(pending))
	sem := make(chan struct{}, 6) // 限并发,避免打爆上游 / 出网带宽
	g, gctx := errgroup.WithContext(ctx)
	for i, u := range pending {
		i, u := i, u
		results[i].raw = u
		results[i].fallback = signed[u]
		download := u
		if su := signed[u]; su != "" {
			download = su // signHost 防盗链图须用签名 URL 下载
		}
		g.Go(func() error {
			sem <- struct{}{}
			defer func() { <-sem }()
			data, ct, err := downloadImage(gctx, s.coverHTTP, download)
			if err != nil || len(data) == 0 {
				return nil // 失败走回退,不中断其它图
			}
			key := "covers/echotik/" + hashByRaw[u] + extForContentType(ct)
			cosURL, err := s.storage.Put(gctx, key, data, ct)
			if err != nil {
				logger.Warn("发现页封面转存 COS 失败,回退签名 URL", logger.Err(err))
				return nil
			}
			results[i].cos = cosURL
			return nil
		})
	}
	_ = g.Wait()

	newAssets := make([]model.CoverAsset, 0, len(results))
	for _, r := range results {
		switch {
		case r.cos != "":
			out[r.raw] = r.cos
			newAssets = append(newAssets, model.CoverAsset{RawHash: hashByRaw[r.raw], RawURL: r.raw, CosURL: r.cos})
		case r.fallback != "":
			out[r.raw] = r.fallback // 永久化失败,至少给签名 URL(不退化)
		}
	}

	// 4. 落 cover_asset(冲突忽略:允许并发请求重复下载/Put 同 key,幂等)。
	if len(newAssets) > 0 && s.db != nil {
		if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "raw_hash"}},
			DoNothing: true,
		}).Create(&newAssets).Error; err != nil {
			logger.Warn("发现页封面映射落库失败", logger.Err(err))
		}
	}
	return out
}

func coverHash(raw string) string {
	sum := sha1.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// downloadImage GET 一张图片,返回字节 + content-type。上限 10MB 防御异常响应。
func downloadImage(ctx context.Context, client *http.Client, rawURL string) ([]byte, string, error) {
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("下载封面 HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, "", err
	}
	return data, resp.Header.Get("Content-Type"), nil
}

func extForContentType(ct string) string {
	ct = strings.ToLower(ct)
	switch {
	case strings.Contains(ct, "png"):
		return ".png"
	case strings.Contains(ct, "webp"):
		return ".webp"
	case strings.Contains(ct, "gif"):
		return ".gif"
	default:
		return ".jpg"
	}
}
