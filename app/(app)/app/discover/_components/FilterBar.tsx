"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, ChevronDown, ChevronUp } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { REGIONS, type Region } from "./regions";
import { useDiscoverFilterMemory } from "./filter-memory";

export type { Region };
export { REGIONS };
export type CategoryOption = { id: string; name: string };
export type FieldOption = { v: number; cn: string };

/** 选品各榜共用的筛选栏:地区 + 一级类目。改 URL query 触发 SSR 重取。
 *  榜单类型 / 排序固定走默认值(由页面 query 决定),不在 UI 暴露。 */
export function FilterBar({
  basePath,
  region,
  rankType,
  field,
  categoryId = null,
  categories = [],
}: {
  basePath: string;
  region: Region;
  rankType: number;
  field: number;
  /** 仍由调用方传入以兼容,但当前不在筛选栏渲染。 */
  fields?: FieldOption[];
  categoryId?: string | null;
  categories?: CategoryOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 在选品内记住地区/类别(localStorage):切榜由 Tab 带参,这里管刷新/裸进入回填。
  // categories 非空=该榜支持类目(商品/店铺);视频/达人榜无类目,只记地区不擦类目。
  useDiscoverFilterMemory(basePath, region, categoryId, categories.length > 0);

  function navigate(patch: { region?: Region; rank_type?: number; field?: number; category_id?: string | null }) {
    const p = new URLSearchParams();
    p.set("region", patch.region ?? region);
    p.set("rank_type", String(patch.rank_type ?? rankType));
    p.set("field", String(patch.field ?? field));
    const cat = patch.category_id === undefined ? categoryId : patch.category_id;
    if (cat) p.set("category_id", cat);
    startTransition(() => router.push(`${basePath}?${p.toString()}`));
  }

  return (
    <div
      className={`rounded-xl border border-zinc-200/80 bg-white px-5 py-4 divide-y divide-zinc-100 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <PillRow label={<><Globe className="h-3.5 w-3.5" />国家/地区</>}>
        {REGIONS.map((r) => (
          <Pill
            key={r.code}
            active={region === r.code}
            onClick={() => navigate({ region: r.code, category_id: null })}
          >
            <span className="mr-1">{r.flag}</span>
            {r.cn}
          </Pill>
        ))}
      </PillRow>

      {categories.length > 0 && (
        <CategoryRow
          categories={categories}
          active={categoryId ?? ""}
          onSelect={(id) => navigate({ category_id: id || null })}
        />
      )}
    </div>
  );
}

function PillRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="inline-flex shrink-0 items-center gap-1 pt-1.5 text-sm font-semibold text-zinc-800 w-[84px] whitespace-nowrap">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">{children}</div>
    </div>
  );
}

// 类目行:超过 11 个折叠,行尾给「展开/收起」。
function CategoryRow({
  categories,
  active,
  onSelect,
}: {
  categories: CategoryOption[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED = 11;
  const overflow = categories.length > COLLAPSED;
  const visible = overflow && !expanded ? categories.slice(0, COLLAPSED) : categories;

  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="shrink-0 pt-1.5 text-sm font-semibold text-zinc-800 w-[84px] whitespace-nowrap">
        商品分类
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
        <Pill active={active === ""} onClick={() => onSelect("")}>
          全部
        </Pill>
        {visible.map((c) => (
          <Pill key={c.id} active={active === c.id} onClick={() => onSelect(c.id)}>
            {c.name}
          </Pill>
        ))}
      </div>
      {overflow && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600 hover:bg-brand-100"
        >
          {expanded ? "收起" : "展开"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
