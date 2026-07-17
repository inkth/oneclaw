"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, ChevronDown, ChevronUp, Search, X, Sparkles } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { REGIONS, type Region } from "./regions";
import { useDiscoverFilterMemory } from "./filter-memory";

export type { Region };
export { REGIONS };
export type CategoryOption = { id: string; name: string };
export type FieldOption = { v: number; cn: string };

/** 选品各榜共用的筛选栏：关键词搜索 + 地区 + 一级类目。改 URL query 触发 SSR 重取。
 *  榜单类型 / 排序固定走默认值（由页面 query 决定），不在 UI 暴露。
 *  搜索态（keyword 非空）:走 EchoTik 关键词搜索，接口只认 region(不支持类目/分页),
 *  故此时隐藏类目行，地区改为「在新地区重搜」。 */
export function FilterBar({
  basePath,
  region,
  rankType,
  field,
  categoryId = null,
  categories = [],
  keyword = "",
  ai = false,
  showAiFilter = false,
  searchPlaceholder = "输入关键词搜索…",
}: {
  basePath: string;
  region: Region;
  rankType: number;
  field: number;
  /** 仍由调用方传入以兼容，但当前不在筛选栏渲染。 */
  fields?: FieldOption[];
  categoryId?: string | null;
  categories?: CategoryOption[];
  /** 当前关键词（URL ?q=）;非空=搜索态。 */
  keyword?: string;
  /** 当前是否只看 AI 视频（URL ?ai=1）。仅 showAiFilter 榜生效。 */
  ai?: boolean;
  /** 是否展示「AI 视频」筛选行（仅视频榜开启）。 */
  showAiFilter?: boolean;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const searching = keyword.trim().length > 0;

  // 在选品内记住地区/类别（localStorage）:切榜由 Tab 带参，这里管刷新/裸进入回填。
  // categories 非空=该榜支持类目（商品/店铺）;视频/达人榜无类目，只记地区不擦类目。
  // 搜索态下视作「不跟踪类目」:别让搜索期间被丢弃的类目把记忆里的选择擦成 null。
  useDiscoverFilterMemory(basePath, region, categoryId, categories.length > 0 && !searching);

  function navigate(patch: {
    region?: Region;
    rank_type?: number;
    field?: number;
    category_id?: string | null;
    q?: string | null;
    ai?: boolean;
  }) {
    const p = new URLSearchParams();
    p.set("region", patch.region ?? region);
    p.set("rank_type", String(patch.rank_type ?? rankType));
    p.set("field", String(patch.field ?? field));
    const cat = patch.category_id === undefined ? categoryId : patch.category_id;
    if (cat) p.set("category_id", cat);
    const q = patch.q === undefined ? keyword : patch.q;
    if (q && q.trim()) p.set("q", q.trim());
    const aiOn = patch.ai === undefined ? ai : patch.ai;
    if (aiOn) p.set("ai", "1");
    startTransition(() => router.push(`${basePath}?${p.toString()}`));
  }

  return (
    <div
      className={`dk-card divide-y divide-[var(--dk-stroke-divider)] px-4 py-3.5 transition-opacity sm:px-5 sm:py-4 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <SearchRow
        key={keyword}
        keyword={keyword}
        placeholder={searchPlaceholder}
        // 提交搜索：丢弃类目（接口不支持组合），回到第 1 页。清空：退出搜索态。
        onSubmit={(kw) => navigate({ q: kw || null, category_id: null })}
      />

      {/* AI 视频筛选：仅视频榜开启；搜索态下隐藏（搜索接口不支持 created_by_ai）。 */}
      {showAiFilter && !searching && (
        <PillRow label={<><Sparkles className="h-3.5 w-3.5" />视频类型</>}>
          <Pill active={!ai} onClick={() => navigate({ ai: false })}>
            全部
          </Pill>
          <Pill active={ai} onClick={() => navigate({ ai: true })}>
            AI 视频
          </Pill>
        </PillRow>
      )}

      <PillRow label={<><Globe className="h-3.5 w-3.5" />国家/地区</>}>
        {REGIONS.map((r) => (
          <Pill
            key={r.code}
            active={region === r.code}
            // 搜索态切地区=在新地区重搜（保留 q）;否则正常切榜并清类目。
            onClick={() => navigate({ region: r.code, category_id: searching ? undefined : null })}
          >
            <span className="mr-1">{r.flag}</span>
            {r.cn}
          </Pill>
        ))}
      </PillRow>

      {categories.length > 0 && !searching && (
        <CategoryRow
          categories={categories}
          active={categoryId ?? ""}
          onSelect={(id) => navigate({ category_id: id || null })}
        />
      )}
    </div>
  );
}

// 搜索行：受控输入,Enter / 放大镜按钮提交；有词时显示清除按钮。
function SearchRow({
  keyword,
  placeholder,
  onSubmit,
}: {
  keyword: string;
  placeholder: string;
  onSubmit: (kw: string) => void;
}) {
  const [value, setValue] = useState(keyword);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
      className="flex flex-col items-stretch gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-zinc-700 sm:w-[84px] sm:text-sm">
        <Search className="h-3.5 w-3.5" />
        搜索
      </span>
      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="h-9 w-full rounded-xl border border-[var(--dk-stroke-border)] bg-[var(--dk-surface-2)] pl-3.5 pr-9 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-[background-color,border-color,box-shadow] focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                if (keyword) onSubmit("");
              }}
              aria-label="清除"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-[var(--dk-btn-black)] px-4 text-sm font-medium text-white shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--dk-btn-black-hover)]"
        >
          <Search className="h-3.5 w-3.5" />
          搜索
        </button>
      </div>
    </form>
  );
}

function PillRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-stretch gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-zinc-700 sm:w-[84px] sm:pt-1.5 sm:text-sm">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">{children}</div>
    </div>
  );
}

// 类目行：折叠态只留第一行（类目已按热门优先排序），行尾给「展开/收起」。
// 一行装得下几个取决于容器宽度和类目名长度，所以用一份隐藏的全量副本实测：
// 与第一个 pill 同 offsetTop 的即第一行，据此算 cutoff，容器宽度变化时重测。
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
  const [cutoff, setCutoff] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const remeasure = () => {
      const pills = Array.from(measure.children) as HTMLElement[];
      if (pills.length === 0) return;
      const firstRowTop = pills[0].offsetTop;
      const firstRow = pills.filter((p) => p.offsetTop === firstRowTop).length;
      // 第一个是「全部」，不算进类目配额；至少留一个类目，免得窄屏折成空行。
      setCutoff(Math.max(1, firstRow - 1));
    };

    remeasure();
    const ro = new ResizeObserver(remeasure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [categories]);

  // cutoff 未测出前先渲染全量，避免首帧闪一个错误的短列表。
  const overflow = cutoff !== null && cutoff < categories.length;
  const visible = overflow && !expanded ? categories.slice(0, cutoff) : categories;

  return (
    <div className="flex flex-col items-stretch gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 text-xs font-semibold text-zinc-700 sm:w-[84px] sm:pt-1.5 sm:text-sm">
        商品分类
      </span>
      <div ref={containerRef} className="relative flex flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
        <Pill active={active === ""} onClick={() => onSelect("")}>
          全部
        </Pill>
        {visible.map((c) => (
          <Pill key={c.id} active={active === c.id} onClick={() => onSelect(c.id)}>
            {c.name}
          </Pill>
        ))}
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute inset-x-0 top-0 flex flex-wrap items-center gap-x-1 gap-y-1.5"
        >
          <Pill>全部</Pill>
          {categories.map((c) => (
            <Pill key={c.id}>{c.name}</Pill>
          ))}
        </div>
      </div>
      {overflow && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex h-8 shrink-0 self-start items-center gap-0.5 rounded-full bg-[var(--dk-btn-tertiary)] px-3 text-xs font-medium text-brand-600 hover:bg-[var(--dk-btn-tertiary-hover)] sm:text-[13px]"
        >
          {expanded ? "收起" : "展开"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
