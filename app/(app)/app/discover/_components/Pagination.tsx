"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 选品各榜底部分页。页码动态展开到「下一可达页」,封顶 maxPage(默认 10)。
 * 改 URL ?page= 触发 SSR 重取;不足两页时不渲染。
 * 不依赖总条数(榜单拿不到总数),只靠当前页是否还有下一页推断。
 */
export function Pagination({
  page,
  hasNext,
  maxPage = 10,
}: {
  page: number;
  hasNext: boolean;
  maxPage?: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  // 已知可达的最大页:还有下一页就多露一格,封顶 maxPage。
  const maxShown = Math.min(hasNext ? page + 1 : page, maxPage);
  if (maxShown <= 1) return null;

  function go(p: number) {
    if (p === page || p < 1 || p > maxPage) return;
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    start(() => router.push(qs ? `?${qs}` : "?", { scroll: true }));
  }

  const pages = Array.from({ length: maxShown }, (_, i) => i + 1);

  return (
    <nav
      aria-label="分页"
      className={cn(
        "flex items-center justify-center gap-1.5 pt-2",
        pending && "pointer-events-none opacity-60",
      )}
    >
      <Arrow dir="prev" disabled={page <= 1} onClick={() => go(page - 1)} />
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => go(p)}
          aria-current={p === page ? "page" : undefined}
          className={cn(
            "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium tabular-nums transition-colors",
            p === page
              ? "bg-[var(--accent-pop)] text-white shadow-sm"
              : "border border-zinc-200/80 text-zinc-600 hover:border-violet-200 hover:bg-violet-50/60",
          )}
        >
          {p}
        </button>
      ))}
      <Arrow dir="next" disabled={!hasNext || page >= maxPage} onClick={() => go(page + 1)} />
    </nav>
  );
}

function Arrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "上一页" : "下一页"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 text-zinc-500 transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:border-violet-200 hover:bg-violet-50/60",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
