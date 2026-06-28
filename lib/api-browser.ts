/**
 * 客户端 → Go 后端的取数封装(Client Component 用)。
 * 生产同域(nginx)时 NEXT_PUBLIC_API_BASE 留空走相对路径;
 * 本地分端口开发时设为 http://localhost:8082。
 */
import { notifyAuthExpired } from "./auth-expired";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function apiBrowser<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
    credentials: "include",
  });
  if (res.status === 401) notifyAuthExpired();
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message ?? `请求失败 (${res.status})`);
  }
  return json.data as T;
}

/**
 * fetch 的薄封装,供轮询/确认等手写 fetch 的调用点直接替换:
 * 收到 401 即唤起统一登录弹窗(notifyAuthExpired),其余行为与 fetch 一致(返回 Response)。
 * path 沿用调用方写法(同源相对路径 /api/v1/...),不再前缀 BASE。
 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (res.status === 401) notifyAuthExpired();
  return res;
}
