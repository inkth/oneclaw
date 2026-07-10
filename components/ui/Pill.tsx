"use client";

import { cn } from "@/lib/utils";

/** 可点选 pill（筛选 / 分段）。
 *  选中态用近黑实底而非品牌紫：筛选栏上常有两三颗 pill 同时选中，品牌色铺到这个密度
 *  就从「强调」退化成「底噪」。近黑与主按钮同源，且不会和中性 hover 底撞色。
 *  品牌电紫只留给成交级 CTA 与焦点环。 */
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
          ? "bg-[var(--dk-btn-black)] text-white"
          : "text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)] hover:text-ink",
        className
      )}
    >
      {children}
    </button>
  );
}
