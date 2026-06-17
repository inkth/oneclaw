"use client";

import { useState } from "react";

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
        "这个区域 / 榜单组合下还没有可用数据。试试换个国家或榜单。"
      }
    />
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
  // 图片加载失败(签名过期 / 防盗链 / 网络)时回退渐变占位,不露浏览器裂图。
  // 记录失败的具体 src:换榜/翻页后 src 变化会自动重新尝试新图(纯 boolean 会卡在占位)。
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailedSrc(src)}
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
