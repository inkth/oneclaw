"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flame, TrendingUp, Star, Globe, Tag } from "lucide-react";

export type Region = "US" | "GB" | "ID" | "TH" | "VN" | "MY";
export type CategoryOption = { id: string; name: string };
export type FieldOption = { v: number; cn: string };

export const REGIONS: Array<{ code: Region; cn: string; flag: string }> = [
  { code: "US", cn: "美国", flag: "🇺🇸" },
  { code: "GB", cn: "英国", flag: "🇬🇧" },
  { code: "ID", cn: "印尼", flag: "🇮🇩" },
  { code: "TH", cn: "泰国", flag: "🇹🇭" },
  { code: "VN", cn: "越南", flag: "🇻🇳" },
  { code: "MY", cn: "马来", flag: "🇲🇾" },
];

const RANK_TYPES: Array<{
  v: number;
  cn: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}> = [
  { v: 1, cn: "热销", icon: Flame, tone: "from-orange-500 to-rose-500" },
  { v: 2, cn: "上升", icon: TrendingUp, tone: "from-indigo-500 to-violet-500" },
  { v: 3, cn: "新品", icon: Star, tone: "from-emerald-500 to-teal-500" },
];

/** 选品四个 Tab 共用的筛选栏：国家 + 一级类目 + 榜单类型 + 排序字段，全部走 URL 参数。 */
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

  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white p-4 flex flex-wrap items-center gap-x-4 gap-y-3 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <FilterGroup label={<><Globe className="h-3 w-3" />国家</>}>
        {REGIONS.map((r) => (
          <button
            key={r.code}
            onClick={() => navigate({ region: r.code })}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              region === r.code ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <span>{r.flag}</span>
            {r.cn}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="榜单">
        {RANK_TYPES.map((rt) => {
          const Icon = rt.icon;
          const active = rankType === rt.v;
          return (
            <button
              key={rt.v}
              onClick={() => navigate({ rank_type: rt.v })}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                active ? `bg-gradient-to-br ${rt.tone} text-white` : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <Icon className="h-3 w-3" />
              {rt.cn}
            </button>
          );
        })}
      </FilterGroup>

      <FilterGroup label="按">
        {fields.map((f) => {
          const active = field === f.v;
          return (
            <button
              key={f.v}
              onClick={() => navigate({ field: f.v })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {f.cn}
            </button>
          );
        })}
      </FilterGroup>

      <FilterGroup label={<><Tag className="h-3 w-3" />类目</>}>
        <select
          value={categoryId ?? ""}
          onChange={(e) => navigate({ category_id: e.target.value || null })}
          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 max-w-[180px]"
        >
          <option value="">全部类目</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FilterGroup>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400 whitespace-nowrap">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}
