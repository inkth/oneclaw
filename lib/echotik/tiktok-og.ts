/**
 * TikTok Shop 商品页 og:image 抓取——EchoTik 签名失败时的兜底封面。
 *
 * 流程：
 *   GET https://shop.tiktok.com/view/product/{id}
 *     → 301 到 /us/pdp/{slug}/{id}（或对应区域）
 *     → 返回带 <meta property="og:image"> 的 HTML
 *     → 解析出来的图片地址走 TikTok 官方 CDN（p16-oec-...ttcdn-us.com），公开可访问
 *
 * 注意：
 *   - 一个商品只能拿到一张主图（vs EchoTik 详情里 8-9 张）
 *   - 频次：sequential + 300ms 节流，避免触发反爬
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const OG_IMG_RE =
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;

export async function fetchTiktokOgImage(productId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://shop.tiktok.com/view/product/${productId}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      // 不要 Next.js Data Cache 缓存（每次都拿最新）
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[tiktok-og] ${productId} HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    const m = html.match(OG_IMG_RE);
    if (!m?.[1]) {
      console.warn(`[tiktok-og] ${productId} no og:image`);
      return null;
    }
    // HTML entity decode（基本的 &amp; → &）
    return m[1].replace(/&amp;/g, "&");
  } catch (e) {
    console.error(`[tiktok-og] ${productId} failed:`, e);
    return null;
  }
}

/**
 * 批量抓 og:image，sequential + 节流。
 * 返回 Map<productId, ogImageUrl>，没拿到的不在 map 里。
 */
export async function fetchTiktokOgImages(
  productIds: string[],
  delayMs = 300,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of productIds) {
    const url = await fetchTiktokOgImage(id);
    if (url) out.set(id, url);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}
