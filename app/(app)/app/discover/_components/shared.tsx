"use client";

import { stringToGradient, initial } from "@/lib/echotik/format";
import { EmptyState as UIEmptyState } from "@/components/ui/EmptyState";

export type DiscoverState = "live" | "cached" | "empty" | "mock" | "error";

/** 空榜提示。 */
export function EmptyState({ hint }: { hint?: string }) {
  return (
    <UIEmptyState
      title="该榜单暂无数据"
      description={
        hint ??
        "这个区域 / 类目组合下还没有可用数据（可能 T-1 数据未生成，或当前账号订阅未覆盖）。试试换个国家或类目。"
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
