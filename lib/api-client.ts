/**
 * 服务端 → Go 后端的取数封装（仅 Server Component / route handler 用）。
 * 转发浏览器带来的 oc_session Cookie,实现 SSR 鉴权。
 */
import { cookies } from "next/headers";

const BASE = process.env.GO_API_INTERNAL_URL ?? "http://localhost:8082";

export type Me = {
  user: {
    id: string;
    phone?: string | null;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
  role?: string;
  // 非 null 即当前用户是代理商（前端据此显示「推广」入口）。
  agency?: { code: string; status: string; commissionBp: number } | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiServer<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new ApiError(res.status, json?.message ?? `请求失败 (${res.status})`);
  }
  return json.data as T;
}

/** 取当前会话（未登录返回 null）。 */
export async function getMe(): Promise<Me | null> {
  try {
    return await apiServer<Me>("/me");
  } catch {
    return null;
  }
}
