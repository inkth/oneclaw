/**
 * 速率限制：默认内存（开发 / 单实例）；如配 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN，
 * 自动切换到 Upstash Ratelimit（多实例 / Serverless 友好）。
 *
 * 用法：
 *   const r = await rateLimit({ key: `register:${ip}`, limit: 5, windowMs: 3600_000 });
 *   if (!r.success) return fail(`太多请求，请 ${r.retryAfter}s 后再试`, 429);
 */

import type { NextRequest } from "next/server";

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  retryAfter: number; // seconds
};

// --- 内存实现：sliding-window 简化版（按窗口重置） ---
type Bucket = { count: number; resetAt: number };
const memoryStore = new Map<string, Bucket>();

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const b = memoryStore.get(key);
  if (!b || now >= b.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((b.resetAt - now) / 1000),
    };
  }
  b.count += 1;
  return {
    success: true,
    remaining: Math.max(0, limit - b.count),
    retryAfter: 0,
  };
}

// 内存 GC：每 5 分钟清掉过期 bucket，避免长跑泄漏
let gcStarted = false;
function ensureGc() {
  if (gcStarted || typeof setInterval !== "function") return;
  gcStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryStore) {
      if (now >= v.resetAt) memoryStore.delete(k);
    }
  }, 5 * 60_000).unref?.();
}

// --- Upstash 实现（仅在配齐 env 时启用） ---
type UpstashClient = {
  call: (path: string, body: string) => Promise<unknown>;
};

let upstash: UpstashClient | null | undefined;
function getUpstash(): UpstashClient | null {
  if (upstash !== undefined) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstash = null;
    return null;
  }
  upstash = {
    async call(path: string, body: string) {
      const r = await fetch(`${url}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      return r.json();
    },
  };
  return upstash;
}

async function upstashRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const client = getUpstash();
  if (!client) return memoryRateLimit(key, limit, windowMs);

  // INCR + EXPIRE 模式（fixed window）
  // 使用 pipeline 减少 RTT
  type PipelineResp = Array<{ result?: number } | { error?: string }>;
  const resp = (await client.call(
    "/pipeline",
    JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, windowMs.toString(), "NX"],
      ["PTTL", key],
    ]),
  )) as PipelineResp;

  const count = ("result" in resp[0] && resp[0].result) || 0;
  const ttl = ("result" in resp[2] && resp[2].result) || windowMs;

  if (count > limit) {
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((ttl as number) / 1000),
    };
  }
  return {
    success: true,
    remaining: Math.max(0, limit - (count as number)),
    retryAfter: 0,
  };
}

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  ensureGc();
  if (getUpstash()) {
    return upstashRateLimit(opts.key, opts.limit, opts.windowMs);
  }
  return memoryRateLimit(opts.key, opts.limit, opts.windowMs);
}

// --- Helpers ---

/** 从 NextRequest 拿到一个尽量真实的客户端 IP（兼容 Vercel/Cloudflare/Nginx） */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  // Next.js 16 Request 没有 ip 字段，最后退到一个稳定占位
  return "unknown";
}
