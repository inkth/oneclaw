"use client";

import { Database, AlertTriangle } from "lucide-react";
import { stringToGradient, initial } from "@/lib/echotik/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState as UIEmptyState } from "@/components/ui/EmptyState";
import type { Tone } from "@/lib/ui/tokens";

export type DiscoverState = "live" | "cached" | "empty" | "mock" | "error";

const STATE_BADGE: Record<
  Exclude<DiscoverState, "empty">,
  { tone: Tone; label: string; danger?: boolean }
> = {
  mock: { tone: "warning", label: "Mock 数据" },
  live: { tone: "success", label: "EchoTik 实时" },
  cached: { tone: "info", label: "本地缓存" },
  error: { tone: "danger", label: "EchoTik 异常 · 已降级", danger: true },
};

/** 数据来源角标：实时 / 缓存 / mock / 降级。 */
export function StateBadge({ state, fetchedAt }: { state: DiscoverState; fetchedAt?: string | null }) {
  if (state === "empty") return null;
  const it = STATE_BADGE[state];
  return (
    <Badge
      tone={it.tone}
      title={state === "cached" && fetchedAt ? `缓存于 ${new Date(fetchedAt).toLocaleString("zh-CN")}` : undefined}
      icon={it.danger ? <AlertTriangle className="h-2.5 w-2.5" /> : <Database className="h-2.5 w-2.5" />}
    >
      {it.label}
    </Badge>
  );
}

/** mock 状态下的提示条。 */
export function MockNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      <div className="text-xs leading-relaxed text-amber-800">
        当前是 mock 数据。在 <code className="rounded bg-amber-100 px-1">.env.local</code> 填上
        <code className="ml-1 rounded bg-amber-100 px-1">ECHOTIK_USERNAME</code> +
        <code className="ml-1 rounded bg-amber-100 px-1">ECHOTIK_PASSWORD</code>，刷新即可拉真实榜单。
      </div>
    </div>
  );
}

/** 空榜提示。 */
export function EmptyState({ hint }: { hint?: string }) {
  return (
    <UIEmptyState
      title="该榜单暂无数据"
      description={
        hint ??
        "EchoTik 这个区域 / 榜单 / 类目组合下还没有可用数据（可能 T-1 数据未生成，或当前账号订阅未覆盖）。试试换个国家或切到「热销」。"
      }
    />
  );
}

/** 缩略图：有图显示图，无图用名字生成稳定渐变 + 首字母占位。 */
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
      <img
        src={src}
        alt=""
        className={`${shape} flex-shrink-0 bg-zinc-100 object-cover`}
        loading="lazy"
      />
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
