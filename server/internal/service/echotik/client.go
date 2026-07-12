package echotik

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/faxianmao/server/internal/config"
)

// 服务端单页最多 10 条;要更多就多页并发拉。
const maxPageSize = 10

// maxPageConcurrency 单次榜单多页拉取的最大并发,防深页预热把 EchoTik 打到 429。
const maxPageConcurrency = 4

type Client struct {
	cfg  config.EchoTikConfig
	http *http.Client
}

func New(cfg config.EchoTikConfig) *Client {
	return &Client{cfg: cfg, http: &http.Client{Timeout: 15 * time.Second}}
}

func (c *Client) Configured() bool { return c.cfg.Configured() }

func (c *Client) authHeader() string {
	raw := c.cfg.Username + ":" + c.cfg.Password
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(raw))
}

func (c *Client) call(ctx context.Context, endpoint string, params map[string]string, out any) error {
	u, err := url.Parse(c.cfg.BaseURL + endpoint)
	if err != nil {
		return err
	}
	q := u.Query()
	for k, v := range params {
		if v != "" {
			q.Set(k, v)
		}
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("echotik HTTP %d on %s", resp.StatusCode, endpoint)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// GetProductRanklist 拉榜单。处理单页上限 + 多页并发 + 日期回退。
func (c *Client) GetProductRanklist(ctx context.Context, p RanklistParams) ([]ProductListItem, error) {
	desired := p.PageSize
	if desired <= 0 {
		desired = 20
	}
	pagesNeeded := (desired + maxPageSize - 1) / maxPageSize
	// 均分到各 EchoTik 页(真实调用方 10/16/20/160 都整除),使 EchoTik 页边界与调用方页宽对齐。
	pageSize := (desired + pagesNeeded - 1) / pagesNeeded
	page := p.PageNum
	if page <= 0 {
		page = 1
	}
	// 调用方页码(宽 desired)换算 EchoTik 起始页(宽 pageSize)。直接拿 p.PageNum 当起始页
	// 会在 desired>10 时与上一页重叠(16 条页的第 11 页应取 EchoTik 页 21-22,而非 11-12)。
	startPage := (page-1)*pagesNeeded + 1

	dates := []string{p.Date}
	if p.Date == "" {
		// 服务端为 T-1 数据,逐天回退兜底。
		dates = []string{daysAgo(1), daysAgo(2), daysAgo(3)}
	}

	var lastErr error
	for _, date := range dates {
		results := make([][]ProductListItem, pagesNeeded)
		g, gctx := errgroup.WithContext(ctx)
		// 限并发:深页预热(page_size=160→16 页)若全并发会被 EchoTik 429。
		// 4 与旧默认(page_size=30→3 页)同量级,既不限流又够快。
		g.SetLimit(maxPageConcurrency)
		for i := 0; i < pagesNeeded; i++ {
			i := i
			g.Go(func() error {
				params := map[string]string{
					"region":             p.Region,
					"rank_type":          strconv.Itoa(p.RankType),
					"product_rank_field": strconv.Itoa(p.RankField),
					"category_id":        p.CategoryID,
					"date":               date,
					"page_size":          strconv.Itoa(pageSize),
					"page_num":           strconv.Itoa(startPage + i),
				}
				var env Envelope[[]ProductListItem]
				if err := c.call(gctx, "/echotik/product/ranklist", params, &env); err != nil {
					return err
				}
				if env.Code != 0 && env.Code != 200 {
					return fmt.Errorf("echotik code %d: %s", env.Code, env.Message)
				}
				results[i] = env.Data
				return nil
			})
		}
		if err := g.Wait(); err != nil {
			lastErr = err
			continue
		}
		var all []ProductListItem
		for _, page := range results {
			all = append(all, page...)
		}
		if len(all) > desired {
			all = all[:desired]
		}
		if len(all) > 0 {
			return all, nil
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return []ProductListItem{}, nil
}

func daysAgo(n int) string {
	return time.Now().AddDate(0, 0, -n).Format("2006-01-02")
}
