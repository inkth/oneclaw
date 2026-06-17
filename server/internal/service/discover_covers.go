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
)

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
	pending := uniq
	if s.db != nil {
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
		rest := make([]string, 0, len(uniq))
		for _, u := range uniq {
			if cos, ok := cosByHash[hashByRaw[u]]; ok {
				out[u] = cos
			} else {
				rest = append(rest, u)
			}
		}
		pending = rest
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
