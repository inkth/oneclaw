"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Pill } from "@/components/ui/Pill";

export type Region = "US" | "GB" | "ID" | "TH" | "VN" | "MY";
export type CategoryOption = { id: string; name: string };
export type FieldOption = { v: number; cn: string };

export const REGIONS: Array<{ code: Region; cn: string }> = [
  { code: "US", cn: "美国" },
  { code: "ID", cn: "印度尼西亚" },
  { code: "GB", cn: "英国" },
  { code: "VN", cn: "越南" },
  { code: "TH", cn: "泰国" },
  { code: "MY", cn: "马来西亚" },
];

const RANK_TYPES: Array<{ v: number; cn: string }> = [
  { v: 1, cn: "热销" },
  { v: 2, cn: "上升" },
  { v: 3, cn: "新品" },
];

// 行内单个可选项
type Item = { value: string; label: string };

/** 选品四个 Tab 共用的筛选栏：fastmoss 样式——左侧标签 + 一排玫红 pill，类目可展开。 */
export function FilterBar({
  basePath,
  region,
  rankType,
  field,
  categoryId,
  categories,
  fields,
}: {
  basePath: string;
  region: Region;
  rankType: number;
  field: number;
  categoryId: string | null;
  categories: CategoryOption[];
  fields: FieldOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(patch: {
    region?: Region;
    rank_type?: number;
    field?: number;
    category_id?: string | null;
  }) {
    const p = new URLSearchParams();
    p.set("region", patch.region ?? region);
    p.set("rank_type", String(patch.rank_type ?? rankType));
    p.set("field", String(patch.field ?? field));
    const cat = patch.category_id === undefined ? categoryId : patch.category_id;
    if (cat) p.set("category_id", cat);
    startTransition(() => router.push(`${basePath}?${p.toString()}`));
  }

  const regionItems: Item[] = REGIONS.map((r) => ({ value: r.code, label: r.cn }));
  const rankItems: Item[] = RANK_TYPES.map((r) => ({ value: String(r.v), label: r.cn }));
  const fieldItems: Item[] = fields.map((f) => ({ value: String(f.v), label: f.cn }));
  const categoryItems: Item[] = [
    { value: "", label: "全部" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div
      className={`rounded-xl border border-zinc-200/80 bg-white px-5 py-4 divide-y divide-zinc-100 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <PillRow
        label="国家/地区"
        items={regionItems}
        active={region}
        onSelect={(v) => navigate({ region: v as Region })}
      />
      <PillRow
        label="榜单类型"
        items={rankItems}
        active={String(rankType)}
        onSelect={(v) => navigate({ rank_type: Number(v) })}
      />
      <PillRow
        label="排序"
        items={fieldItems}
        active={String(field)}
        onSelect={(v) => navigate({ field: Number(v) })}
      />
      <PillRow
        label="商品分类"
        items={categoryItems}
        active={categoryId ?? ""}
        onSelect={(v) => navigate({ category_id: v || null })}
        collapsible
        collapsedCount={11}
      />
    </div>
  );
}

/** 一行筛选：标签 + 一排 pill。collapsible 时超出 collapsedCount 折叠，行尾给「展开/收起」。 */
function PillRow({
  label,
  items,
  active,
  onSelect,
  collapsible = false,
  collapsedCount = 12,
}: {
  label: string;
  items: Item[];
  active: string;
  onSelect: (value: string) => void;
  collapsible?: boolean;
  collapsedCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflow = collapsible && items.length > collapsedCount;
  const visible = overflow && !expanded ? items.slice(0, collapsedCount) : items;

  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="shrink-0 pt-1 text-sm font-semibold text-zinc-800 w-[84px] whitespace-nowrap">
        {label}：
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
        {visible.map((it) => (
          <Pill key={it.value} active={active === it.value} onClick={() => onSelect(it.value)}>
            {it.label}
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
