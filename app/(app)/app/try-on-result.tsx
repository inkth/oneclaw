"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Shirt, UserRound } from "lucide-react";
import type { StreamTask } from "./task-stream";
import { authFetch } from "@/lib/api-browser";

/**
 * 虚拟试穿结果:任务 DONE 后出图仍异步进行,按 imagesStatus 自轮询。
 * 输入两张图(模特 / 服饰)+ 输出上身图;失败给可重试提示(重新派活)。
 */
export function TryOnResult({ task }: { task: StreamTask }) {
  const [meta, setMeta] = useState(task.metadata ?? {});
  const running = meta.imagesStatus === "RUNNING" || meta.imagesStatus === "PENDING";

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const res = await authFetch(`/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}`);
        const json = await res.json().catch(() => null);
        const fresh = (json?.data?.task ?? json?.task) as StreamTask | undefined;
        if (res.ok && fresh?.metadata) setMeta(fresh.metadata);
      } catch {
        // 网络抖动忽略,下个周期重试
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [running, task.workspaceId, task.id]);

  const result = meta.images?.[0];

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-end gap-2">
        <Thumb url={meta.modelUrl} label="模特" icon={UserRound} />
        <span className="pb-7 text-zinc-300">＋</span>
        <Thumb url={meta.garmentUrl} label="服饰" icon={Shirt} />
        <span className="pb-7 text-zinc-300">→</span>
        {/* 结果位 */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-44 w-32 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            {result ? (
              <Image src={result} alt="上身效果图" fill sizes="128px" unoptimized className="object-cover" />
            ) : meta.imagesStatus === "FAILED" ? (
              <div className="flex h-full items-center justify-center px-2 text-center text-2xs text-rose-500">
                出图失败,积分已退回
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-2xs text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                出图中…
              </div>
            )}
          </div>
          <span className="text-2xs font-medium text-zinc-500">上身效果</span>
        </div>
      </div>

      {result && (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={result}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            查看原图
          </a>
          <Link
            href="/app/assets/materials"
            className="inline-flex items-center gap-1 text-2xs text-zinc-400 transition-colors hover:text-brand-600"
          >
            已存入素材库 · 做视频时可直接选用
          </Link>
        </div>
      )}
      {meta.imagesStatus === "FAILED" && (
        <p className="text-2xs text-zinc-400">
          {meta.imagesError ?? "可换一位模特或换一张更清晰的服饰平铺图,重新发起试穿。"}
        </p>
      )}
    </div>
  );
}

function Thumb({
  url,
  label,
  icon: Icon,
}: {
  url?: string;
  label: string;
  icon: typeof UserRound;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-44 w-32 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
        {url ? (
          <Image src={url} alt={label} fill sizes="128px" unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-300">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <span className="text-2xs font-medium text-zinc-500">{label}</span>
    </div>
  );
}
