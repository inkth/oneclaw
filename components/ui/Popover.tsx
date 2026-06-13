"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * 轻量锚定弹层：聊天框下方的「并列按钮」点开后展开配置面板。
 * 自管开合，点击外部 / Esc 关闭。trigger 与 panel 都用 render prop，
 * 方便拿到 open / close 状态。
 *
 * 面板用 portal 渲染到 body、fixed 定位锚到触发按钮，避免被祖先
 * 的 overflow-hidden 裁切或层叠上下文盖住；空间不足时自动向上展开。
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 关闭：点击外部（含 portal 面板外）/ Esc
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
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

  // fixed 定位：测量触发按钮与面板尺寸，决定上下方向并夹进视口
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const gap = 8;
      const pw = panel?.offsetWidth ?? 0;
      const ph = panel?.offsetHeight ?? 0;
      const below = window.innerHeight - r.bottom;
      const openUp = below < ph + gap && r.top > below;
      const top = openUp ? r.top - gap - ph : r.bottom + gap;
      let left =
        align === "end"
          ? r.right - pw
          : align === "center"
            ? r.left + r.width / 2 - pw / 2
            : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      setPos({ top: Math.max(8, top), left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="block">
        {trigger({ open })}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className={cn(
              "z-50 rounded-xl border border-zinc-200/80 bg-white p-3 shadow-lg",
              panelClassName,
            )}
          >
            {children({ close: () => setOpen(false) })}
          </div>,
          document.body,
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
