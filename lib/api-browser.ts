/**
 * 客户端 → Go 后端的取数封装(Client Component 用)。
 * 生产同域(nginx)时 NEXT_PUBLIC_API_BASE 留空走相对路径;
 * 本地分端口开发时设为 http://localhost:8082。
 */
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
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message ?? `请求失败 (${res.status})`);
  }
  return json.data as T;
}
