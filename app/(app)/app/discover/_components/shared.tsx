"use client";

import { Database, AlertTriangle } from "lucide-react";
import { stringToGradient, initial } from "@/lib/echotik/format";

export type DiscoverState = "live" | "cached" | "empty" | "mock" | "error";

/** 数据来源角标：实时 / 缓存 / mock / 降级。 */
export function StateBadge({ state, fetchedAt }: { state: DiscoverState; fetchedAt?: string | null }) {
  if (state === "mock")
    return (
      <Badge tone="amber" icon={<Database className="h-2.5 w-2.5" />}>
        Mock 数据
      </Badge>
    );
  if (state === "live")
    return (
      <Badge tone="emerald" icon={<Database className="h-2.5 w-2.5" />}>
        EchoTik 实时
      </Badge>
    );
  if (state === "cached")
    return (
      <Badge tone="sky" icon={<Database className="h-2.5 w-2.5" />} title={fetchedAt ? `缓存于 ${new Date(fetchedAt).toLocaleString("zh-CN")}` : undefined}>
        本地缓存
      </Badge>
    );
  if (state === "error")
    return (
      <Badge tone="rose" icon={<AlertTriangle className="h-2.5 w-2.5" />}>
        EchoTik 异常 · 已降级
      </Badge>
    );
  return null;
}

const TONES: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
};

function Badge({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof TONES | string;
  icon: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${TONES[tone] ?? TONES.amber}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** mock 状态下的提示条。 */
export function MockNotice() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="text-xs text-amber-800 leading-relaxed">
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
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <div className="text-base font-semibold">该榜单暂无数据</div>
      <p className="mt-1.5 text-sm text-zinc-500 max-w-md mx-auto">
        {hint ?? "EchoTik 这个区域 / 榜单 / 类目组合下还没有可用数据（可能 T-1 数据未生成，或当前账号订阅未覆盖）。试试换个国家或切到「热销」。"}
      </p>
    </div>
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
        className={`${shape} flex-shrink-0 object-cover bg-zinc-100`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`${shape} flex-shrink-0 flex items-center justify-center text-sm font-semibold text-white shadow-sm`}
      style={{ background: stringToGradient(name) }}
    >
      {initial(name)}
    </div>
  );
}
