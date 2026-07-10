"use client";

import { cn } from "@/lib/utils";

/** 可点选 pill（筛选 / 分段）：选中态统一 accent(brand)，未选 hover 浅 accent。 */
export function Pill({
  active,
  onClick,
  className,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // Pill 本身就是「胶囊」这一档的例外，圆角保留 rounded-full；
        // 未选中 hover 底色统一用 --dk-action-regular，不用 black/5。
        "press rounded-full px-3.5 py-1 text-sm font-[550] transition-colors",
        active
          ? "bg-[var(--accent-pop)] text-white"
          : "text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)] hover:text-ink",
        className
      )}
    >
      {children}
    </button>
  );
}
