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
    // 底部整条 hairline 用 divider 级描边（比 overlay 更淡，Tab 栏本身只是弱分界）
    <div className={cn("flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", !bare && "border-b border-[var(--dk-stroke-divider)]", className)}>
      {items.map((tab) => {
        const isActive = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors",
              // 激活态字重用 550（按钮/强调档），非 zinc 灰阶收敛到 secondary
              isActive
                ? "border-brand-600 font-[550] text-ink"
                : "border-transparent text-[var(--dk-content-secondary)] hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
