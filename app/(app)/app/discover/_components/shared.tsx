"use client";

import { Database, AlertTriangle } from "lucide-react";
import { EmptyState as UIEmptyState } from "@/components/ui/EmptyState";
import { stringToGradient, initial } from "./format";

export type DiscoverState = "live" | "cached" | "empty" | "mock" | "error";

/** 空榜提示。 */
export function EmptyState({ hint }: { hint?: string }) {
  return (
    <UIEmptyState
      title="该榜单暂无数据"
      description={
        hint ??
        "这个区域 / 榜单组合下还没有可用数据(可能 T-1 数据未生成,或当前账号订阅未覆盖)。试试换个国家或榜单。"
      }
    />
  );
}

/** 数据来源角标:实时 / 缓存 / mock / 降级。 */
export function StateBadge({ state }: { state: DiscoverState }) {
  if (state === "live")
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
        <Database className="h-2.5 w-2.5" />
        EchoTik 实时
      </Badge>
    );
  if (state === "mock")
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700">
        <Database className="h-2.5 w-2.5" />
        Mock 数据
      </Badge>
    );
  if (state === "error")
    return (
      <Badge className="border-rose-200 bg-rose-50 text-rose-700">
        <AlertTriangle className="h-2.5 w-2.5" />
        EchoTik 异常 · 已降级
      </Badge>
    );
  return null;
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/** 缩略图:有图显示图,无图用名字生成稳定渐变 + 首字母占位。 */
export function Thumb({
  src,
  name,
  className = "h-10 w-10 rounded-md",
  rounded,
}: {
  src: string | null;
  name: string;
  className?: string;
  rounded?: boolean;
}) {
  const shape = rounded ? className.replace(/rounded-\S+/, "rounded-full") : className;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={src} alt="" className={`${shape} flex-shrink-0 bg-zinc-100 object-cover`} loading="lazy" />
    );
  }
  return (
    <div
      className={`${shape} flex flex-shrink-0 items-center justify-center text-sm font-semibold text-white shadow-sm`}
      style={{ background: stringToGradient(name) }}
    >
      {initial(name)}
    </div>
  );
}
