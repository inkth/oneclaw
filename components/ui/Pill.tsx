"use client";

import { cn } from "@/lib/utils";

/** 可点选 pill（筛选 / 分段）：选中态统一 accent(indigo)，未选 hover 浅 accent。 */
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
        "rounded-full px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-indigo-600 text-white"
          : "text-zinc-600 hover:bg-indigo-50 hover:text-indigo-700",
        className
      )}
    >
      {children}
    </button>
  );
}
