/**
 * 资产持久化：把第三方临时 URL（如 fal CDN 24-48h 失效）下载并转存到自有存储。
 *
 * 支持的 driver（按优先级）：
 *   1. tencent-cos     —— 推荐生产用，国内访问稳；需要 TENCENT_COS_BUCKET + TENCENT_COS_REGION
 *   2. vercel-blob     —— 用 Vercel 部署时方便；需要 BLOB_READ_WRITE_TOKEN
 *   3. none            —— 兜底：保留 fal CDN URL 原样
 *
 * 调用入口：rehostUrl({ sourceUrl, pathname, contentType })
 *   - 成功返回新 URL；失败 / 没 driver 返回 null
 */

type Driver = "tencent-cos" | "vercel-blob" | null;

function pickDriver(): Driver {
  if (process.env.TENCENT_COS_BUCKET && process.env.TENCENT_COS_REGION) {
    return "tencent-cos";
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  return null;
}

export function isStorageConfigured(): boolean {
  return pickDriver() !== null;
}

export function getStorageName(): string {
  return pickDriver() ?? "none";
}

export type RehostInput = {
  sourceUrl: string;
  pathname: string; // 目标 key，如 'workspaces/xxx/videos/yyy.mp4'
  contentType?: string;
};

export async function rehostUrl(opts: RehostInput): Promise<string | null> {
  const driver = pickDriver();
  if (!driver) return null;
  try {
    const res = await fetch(opts.sourceUrl);
    if (!res.ok) {
      console.error("[storage] source fetch failed", res.status, opts.sourceUrl);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType =
      opts.contentType || res.headers.get("content-type") || "application/octet-stream";
    return uploadWithDriver(driver, opts.pathname, buf, contentType);
  } catch (e) {
    console.error("[storage] rehost failed", e);
    return null;
  }
}

export type UploadBufferInput = {
  buf: Buffer;
  pathname: string;
  contentType?: string;
};

export type UploadResult = {
  url: string;
  driver: "tencent-cos" | "vercel-blob";
};

/**
 * 直传 Buffer。返回 null 表示当前没有可用 driver。
 */
export async function uploadBuffer(opts: UploadBufferInput): Promise<UploadResult | null> {
  const driver = pickDriver();
  if (!driver) return null;
  const url = await uploadWithDriver(
    driver,
    opts.pathname,
    opts.buf,
    opts.contentType ?? "application/octet-stream",
  );
  if (!url) return null;
  return { url, driver };
}

async function uploadWithDriver(
  driver: NonNullable<Driver>,
  pathname: string,
  buf: Buffer,
  contentType: string,
): Promise<string | null> {
  if (driver === "tencent-cos") return uploadToCos(pathname, buf, contentType);
  if (driver === "vercel-blob") return uploadToBlob(pathname, buf, contentType);
  return null;
}

// --- Tencent COS ---

let cosClient: import("cos-nodejs-sdk-v5") | null = null;
async function getCos() {
  if (cosClient) return cosClient;
  const COS = (await import("cos-nodejs-sdk-v5")).default;
  cosClient = new COS({
    SecretId: process.env.TENCENT_SECRET_ID!,
    SecretKey: process.env.TENCENT_SECRET_KEY!,
  }) as unknown as import("cos-nodejs-sdk-v5");
  return cosClient;
}

async function uploadToCos(
  pathname: string,
  buf: Buffer,
  contentType: string,
): Promise<string | null> {
  const Bucket = process.env.TENCENT_COS_BUCKET!;
  const Region = process.env.TENCENT_COS_REGION!;
  if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
    console.error("[storage] cos: TENCENT_SECRET_ID/KEY 未配置");
    return null;
  }
  const Key = pathname.replace(/^\//, "");
  const cos = await getCos();

  return new Promise<string | null>((resolve) => {
    cos.putObject(
      {
        Bucket,
        Region,
        Key,
        Body: buf,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      },
      (err) => {
        if (err) {
          console.error("[storage] cos putObject failed", err);
          resolve(null);
          return;
        }
        // 优先用自定义 CDN 域名；否则用 COS 默认 https URL
        const cdn = process.env.TENCENT_COS_DOMAIN?.replace(/\/$/, "");
        const url = cdn
          ? `${cdn}/${Key}`
          : `https://${Bucket}.cos.${Region}.myqcloud.com/${Key}`;
        resolve(url);
      },
    );
  });
}

// --- Vercel Blob ---

async function uploadToBlob(
  pathname: string,
  buf: Buffer,
  contentType: string,
): Promise<string | null> {
  try {
    const { put } = await import("@vercel/blob");
    const uploaded = await put(pathname, buf, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return uploaded.url;
  } catch (e) {
    console.error("[storage] blob put failed", e);
    return null;
  }
}

// --- 路径工具 ---

export function deriveVideoPath(workspaceId: string, videoId: string): string {
  return `workspaces/${workspaceId}/videos/${videoId}.mp4`;
}

export function deriveThumbnailPath(workspaceId: string, videoId: string): string {
  return `workspaces/${workspaceId}/thumbnails/${videoId}.jpg`;
}

/** 用户上传素材路径：保留原始扩展名 */
export function deriveMaterialPath(
  workspaceId: string,
  materialId: string,
  originalName: string,
): string {
  const ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  return `workspaces/${workspaceId}/materials/${materialId}${ext}`;
}
