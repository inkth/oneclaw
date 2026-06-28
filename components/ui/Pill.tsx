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
        "press rounded-full px-3.5 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--accent-pop)] text-white"
          : "text-zinc-600 hover:bg-black/5 hover:text-ink",
        className
      )}
    >
      {children}
    </button>
  );
}
