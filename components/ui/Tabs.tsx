import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { label: string; href: string };

export type SegmentedItem<T extends string> = { label: string; value: T };

/** 下划线式二级 Tab 栏。激活态统一 accent(brand)。
 *  bare：去掉整条底部 hairline（融进顶栏时用，只保留激活项的短下划线，避免出现明显分界线）。 */
export function Tabs({
  items,
  activeHref,
  className,
  bare = false,
}: {
  items: TabItem[];
  activeHref?: string;
  className?: string;
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        !bare && "rounded-2xl border border-black/[0.06] bg-white/55 p-1 shadow-[0_1px_2px_rgba(18,20,25,.02)]",
        className,
      )}
    >
      {items.map((tab) => {
        const isActive = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 text-sm transition-colors",
              bare ? "-mb-px border-b-2 px-3 py-2.5" : "rounded-xl border border-transparent px-3 py-2",
              isActive && bare && "border-brand-600 font-[550] text-ink",
              !isActive && bare && "border-transparent text-[var(--dk-content-secondary)] hover:text-ink",
              isActive && !bare && "border-black/[0.055] bg-white font-[550] text-ink shadow-[0_1px_2px_rgba(18,20,25,.045)]",
              !isActive && !bare && "text-[var(--dk-content-secondary)] hover:bg-white/70 hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

/** 用于同一路由内的视图切换，视觉语言与链接式 Tabs 保持一致。 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onValueChange,
  className,
  ariaLabel,
}: {
  items: SegmentedItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-black/[0.06] bg-white/55 p-1 shadow-[0_1px_2px_rgba(18,20,25,.02)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "shrink-0 rounded-xl border border-transparent px-3 py-2 text-sm transition-colors",
              active
                ? "border-black/[0.055] bg-white font-[550] text-ink shadow-[0_1px_2px_rgba(18,20,25,.045)]"
                : "text-[var(--dk-content-secondary)] hover:bg-white/70 hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
