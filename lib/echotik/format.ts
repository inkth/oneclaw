/**
 * 纯展示用格式化工具（无副作用、可被 Client / Server 组件复用）。
 * 原先内联在 discover/products/discover-client.tsx，抽出来给选品四个 Tab 共用。
 */

/** 紧凑数字：12.3K / 4.5M */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** 紧凑金额（美元）：$1.23M / $4.5K / $9.99 */
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** 把任意字符串映射成稳定的渐变色，给缺图的封面/头像当占位。 */
export function stringToGradient(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 70% 55%), hsl(${hue2} 70% 65%))`;
}

/** 取字符串首个有效字符（去掉前导 [标签] / @ / 空白）做占位字母。 */
export function initial(s: string): string {
  const cleaned = s.replace(/\[.*?\]/g, "").replace(/^@/, "").trim();
  return (cleaned.charAt(0) || "?").toUpperCase();
}

/** 秒数 → m:ss（视频时长）。 */
export function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** unix 秒（字符串或数字）→ 本地日期 YYYY-MM-DD。 */
export function fmtUnixDate(unixSeconds: string | number): string {
  const n = typeof unixSeconds === "string" ? Number(unixSeconds) : unixSeconds;
  if (!n) return "—";
  return new Date(n * 1000).toISOString().slice(0, 10);
}

/**
 * EchoTik 把"主营类目"塞成 stringified JSON：[{category_name, category_id}, ...]。
 * 解析出前 n 个类目名，失败返回空数组。
 */
export function parseCategoryNames(raw: string | null | undefined, n = 2): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ category_name?: string }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => x?.category_name)
      .filter((x): x is string => Boolean(x))
      .slice(0, n);
  } catch {
    return [];
  }
}
