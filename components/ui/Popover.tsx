"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 轻量锚定弹层：聊天框下方的「并列按钮」点开后展开配置面板。
 * 自管开合，点击外部 / Esc 关闭。trigger 与 panel 都用 render prop，
 * 方便拿到 open / close 状态。
 */
export function Popover({
  trigger,
  children,
  align = "start",
  className,
  panelClassName,
}: {
  trigger: (state: { open: boolean }) => React.ReactNode;
  children: (state: { close: () => void }) => React.ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="block">
        {trigger({ open })}
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-30 mt-2 rounded-xl border border-zinc-200/80 bg-white p-3 shadow-lg",
            align === "end" && "right-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            align === "start" && "left-0",
            panelClassName,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

/** 聊天框下方的工具按钮：未激活灰描边，激活态 accent 浅底，可带数量角标。 */
export function ToolbarButton({
  icon: Icon,
  label,
  active,
  badge,
  open,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  badge?: React.ReactNode;
  open?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active || open
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge != null && badge !== false && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-2xs font-semibold text-white">
          {badge}
        </span>
      )}
    </span>
  );
}
