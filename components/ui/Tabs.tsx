import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { label: string; href: string };

/** 下划线式二级 Tab 栏。激活态统一 accent(brand)。 */
export function Tabs({
  items,
  activeHref,
  className,
}: {
  items: TabItem[];
  activeHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-black/5", className)}>
      {items.map((tab) => {
        const isActive = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "border-ink font-medium text-ink"
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
