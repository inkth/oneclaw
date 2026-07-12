"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { REGION_CODES, type Region } from "./regions";

// 选品筛选（地区/类别）在选品内的记忆：只存浏览器 localStorage,不进后端。
// region 与 categoryId 成对保存，回填时该地区的类目恒有效。
const KEY = "faxianmao:discover-filter";

type Saved = { region: Region; categoryId: string | null };

export function readDiscoverFilter(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    if (!v || !REGION_CODES.includes(v.region as Region)) return null;
    return { region: v.region as Region, categoryId: v.categoryId ?? null };
  } catch {
    return null;
  }
}

export function writeDiscoverFilter(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** 挂在 FilterBar(仅各榜单渲染):
 *  - URL 显式带 region 时，以 URL 为准并记下当前选择;
 *  - 裸进入/刷新无 region 时（页面回落默认值），用上次选择 router.replace 回填。
 *  分享链接（显式 ?region=）永远生效、不被覆盖;replace 不入历史栈，不污染后退。
 *  tracksCategory:该榜是否支持类目筛选(商品/店铺=true;视频/达人=false,
 *  EchoTik 不支持)。不支持的榜只更新地区，保留已存类目，避免切到视频/达人就把类目擦掉。 */
export function useDiscoverFilterMemory(
  basePath: string,
  region: Region,
  categoryId: string | null,
  tracksCategory: boolean,
) {
  const router = useRouter();
  const sp = useSearchParams();
  const hasRegion = sp.has("region");

  useEffect(() => {
    if (hasRegion) {
      if (tracksCategory) {
        writeDiscoverFilter({ region, categoryId });
      } else {
        // 视频/达人榜无类目概念：只记地区，类目沿用上次，别被这里的 null 覆盖。
        writeDiscoverFilter({ region, categoryId: readDiscoverFilter()?.categoryId ?? null });
      }
      return;
    }
    const saved = readDiscoverFilter();
    if (!saved) return;
    // 与当前（默认）态一致则无需回填，避免无谓导航。
    if (saved.region === region && (saved.categoryId ?? null) === categoryId) return;
    const p = new URLSearchParams();
    p.set("region", saved.region);
    if (saved.categoryId) p.set("category_id", saved.categoryId);
    router.replace(`${basePath}?${p.toString()}`);
  }, [hasRegion, region, categoryId, tracksCategory, basePath, router]);
}
