import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { label: string; href: string };

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
