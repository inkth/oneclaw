"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { REGION_CODES, type Region } from "./regions";

// 选品筛选（地区/类别）在选品内的记忆：只存浏览器 localStorage,不进后端。
// region 与类目链成对保存，回填时该地区的类目恒有效。
const KEY = "faxianmao:discover-filter";

export type CategoryChain = {
  categoryId: string | null;
  categoryL2Id: string | null;
  categoryL3Id: string | null;
};

type Saved = { region: Region } & CategoryChain;

export function readDiscoverFilter(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    if (!v || !REGION_CODES.includes(v.region as Region)) return null;
    // 旧格式无 L2/L3 字段:按 null 补齐,链条不变形。
    return {
      region: v.region as Region,
      categoryId: v.categoryId ?? null,
      categoryL2Id: v.categoryId ? (v.categoryL2Id ?? null) : null,
      categoryL3Id: v.categoryId && v.categoryL2Id ? (v.categoryL3Id ?? null) : null,
    };
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
 *  tracksCategory:该榜是否支持类目筛选。不支持的榜只更新地区，保留已存类目链。
 *  tracksSubCategories:该榜是否支持二/三级级联(商品/店铺=true;达人/视频只认一级)。
 *  单级榜的 L2/L3 props 恒为 null,不能拿它去覆盖记忆——一级没变就沿用已存深层链,
 *  一级变了则深层链已不属于新大类,一并清掉。 */
export function useDiscoverFilterMemory(
  basePath: string,
  region: Region,
  chain: CategoryChain,
  tracksCategory: boolean,
  tracksSubCategories = false,
) {
  const router = useRouter();
  const sp = useSearchParams();
  const hasRegion = sp.has("region");
  const { categoryId, categoryL2Id, categoryL3Id } = chain;

  useEffect(() => {
    if (hasRegion) {
      const prev = readDiscoverFilter();
      if (tracksCategory) {
        // 单级榜:一级未变时沿用已存的深层链(props 里的 null 是「不支持」不是「清除」)。
        const keepDeep = !tracksSubCategories && prev?.categoryId === categoryId;
        writeDiscoverFilter({
          region,
          categoryId,
          categoryL2Id: keepDeep ? (prev?.categoryL2Id ?? null) : categoryL2Id,
          categoryL3Id: keepDeep ? (prev?.categoryL3Id ?? null) : categoryL3Id,
        });
      } else {
        // 搜索态等「不跟踪类目」场景：只记地区，类目链沿用上次，别被这里的 null 覆盖。
        writeDiscoverFilter({
          region,
          categoryId: prev?.categoryId ?? null,
          categoryL2Id: prev?.categoryL2Id ?? null,
          categoryL3Id: prev?.categoryL3Id ?? null,
        });
      }
      return;
    }
    const saved = readDiscoverFilter();
    if (!saved) return;
    const savedL2 = tracksSubCategories ? saved.categoryL2Id : null;
    const savedL3 = tracksSubCategories ? saved.categoryL3Id : null;
    // 与当前（默认）态一致则无需回填，避免无谓导航。
    if (
      saved.region === region &&
      (saved.categoryId ?? null) === categoryId &&
      (savedL2 ?? null) === categoryL2Id &&
      (savedL3 ?? null) === categoryL3Id
    )
      return;
    const p = new URLSearchParams();
    p.set("region", saved.region);
    if (saved.categoryId) p.set("category_id", saved.categoryId);
    if (saved.categoryId && savedL2) p.set("category_l2_id", savedL2);
    if (saved.categoryId && savedL2 && savedL3) p.set("category_l3_id", savedL3);
    router.replace(`${basePath}?${p.toString()}`);
  }, [
    hasRegion,
    region,
    categoryId,
    categoryL2Id,
    categoryL3Id,
    tracksCategory,
    tracksSubCategories,
    basePath,
    router,
  ]);
}
