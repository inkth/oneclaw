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
    <div className={cn("flex items-center gap-1", !bare && "border-b border-black/5", className)}>
      {items.map((tab) => {
        const isActive = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "border-brand-600 font-medium text-ink"
                : "border-transparent text-zinc-500 hover:text-ink"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
