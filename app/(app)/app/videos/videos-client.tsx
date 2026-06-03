"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Play, Download, Trash2 } from "lucide-react";
import { VideoDetailDrawer } from "@/components/VideoDetailDrawer";

type Processing = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

type Video = {
  id: string;
  title: string;
  style: string;
  durationSec: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  script: string | null;
  processing: Processing;
  views: number;
  likes: number;
  productTitle: string | null;
  createdAt: string;
};

const styleMap: Record<string, { label: string; gradient: string; emoji: string }> = {
  UNBOXING: {
    label: "Unboxing",
    gradient: "from-rose-400 via-pink-500 to-fuchsia-500",
    emoji: "📦",
  },
  COMPARISON: {
    label: "对比测评",
    gradient: "from-amber-400 via-orange-500 to-rose-500",
    emoji: "⚖️",
  },
  SCENE: {
    label: "生活场景",
    gradient: "from-emerald-400 via-teal-500 to-cyan-500",
    emoji: "🌿",
  },
  BEFORE_AFTER: {
    label: "Before/After",
    gradient: "from-indigo-400 via-violet-500 to-purple-500",
    emoji: "✨",
  },
};

export function VideosClient({
  workspaceId,
  initialVideos,
}: {
  workspaceId: string;
  initialVideos: Video[];
}) {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [drawerVideoId, setDrawerVideoId] = useState<string | null>(null);

  // 自动轮询所有 GENERATING 视频
  useEffect(() => {
    const pending = videos.filter((v) => v.processing === "GENERATING");
    if (pending.length === 0) return;

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        pending.map((v) =>
          fetch(`/api/workspaces/${workspaceId}/videos/${v.id}/refresh`, {
            method: "POST",
          })
            .then((r) => r.json())
            .then((j) => (j.ok ? (j.data.video as Video) : null))
            .catch(() => null),
        ),
      );
      let changed = false;
      setVideos((prev) =>
        prev.map((v) => {
          const upd = updates.find((u) => u && u.id === v.id);
          if (!upd) return v;
          if (upd.processing !== v.processing) changed = true;
          return { ...v, ...upd };
        }),
      );
      if (changed) router.refresh();
    }, 8000);

    return () => clearInterval(interval);
  }, [videos, workspaceId, router]);

  async function refresh(id: string) {
    setRefreshingId(id);
    const res = await fetch(`/api/workspaces/${workspaceId}/videos/${id}/refresh`, {
      method: "POST",
    });
    const json = await res.json();
    setRefreshingId(null);
    if (json.ok && json.data.video) {
      setVideos((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...json.data.video } : v)),
      );
    }
  }

  async function deleteVideo(id: string) {
    if (!confirm("确定删除这条视频？fal 上的资产将无法找回。")) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/videos/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      router.refresh();
    }
  }

  if (videos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
        <div className="text-base font-semibold">还没有视频</div>
        <p className="mt-1.5 text-sm text-zinc-500">
          去 Agent 工作流里调用「创意总监」即可一键生成 4 套短视频。
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {videos.map((v) => {
        const style = styleMap[v.style] ?? styleMap.UNBOXING;
        const isGenerating = v.processing === "GENERATING";
        const isFailed = v.processing === "FAILED";
        return (
          <div
            key={v.id}
            className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white flex flex-col"
          >
            <div className={`relative aspect-[9/14]`}>
              {v.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbnailUrl}
                  alt={v.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient}`} />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/60" />

              {/* 视频播放 / 处理状态 */}
              {v.videoUrl ? (
                <video
                  src={v.videoUrl}
                  controls
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {isGenerating ? (
                    <div className="rounded-full bg-black/50 backdrop-blur px-3 py-1.5 text-[11px] font-medium text-white inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      生成中…
                    </div>
                  ) : isFailed ? (
                    <div className="rounded-full bg-rose-500/80 backdrop-blur px-3 py-1.5 text-[11px] font-medium text-white inline-flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5" />
                      生成失败
                    </div>
                  ) : v.thumbnailUrl ? (
                    <div className="rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-zinc-900 inline-flex items-center gap-1">
                      <Play className="h-3 w-3 fill-current" />
                      仅封面
                    </div>
                  ) : (
                    <div className="text-6xl opacity-90">{style.emoji}</div>
                  )}
                </div>
              )}

              <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-zinc-900">
                9:16 · {v.durationSec}s
              </div>
              {v.processing === "COMPLETED" && v.videoUrl && (
                <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  fal 完成
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-3 text-white pointer-events-none">
                <div className="text-xs font-semibold truncate">{v.title}</div>
                <div className="mt-0.5 text-[10px] opacity-90">
                  {v.views.toLocaleString()} 播放 · {v.likes.toLocaleString()} 赞
                </div>
              </div>
            </div>

            <div className="px-3 py-2.5 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-100">
              <button
                onClick={() => setDrawerVideoId(v.id)}
                className="truncate text-left hover:text-indigo-600 transition-colors"
                title="查看详情"
              >
                {v.productTitle ?? "未关联选品"} · 详情 ›
              </button>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5">
                  {style.label}
                </span>
                {v.videoUrl && (
                  <a
                    href={v.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`${v.title}.mp4`}
                    className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-100"
                    title="下载视频（fal CDN 链接 48h 后失效，建议尽快保存）"
                  >
                    <Download className="h-2.5 w-2.5" />
                  </a>
                )}
                {isGenerating && (
                  <button
                    onClick={() => refresh(v.id)}
                    disabled={refreshingId === v.id}
                    className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    title="检查 fal 状态"
                  >
                    <RefreshCw
                      className={`h-2.5 w-2.5 ${
                        refreshingId === v.id ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                )}
                <button
                  onClick={() => deleteVideo(v.id)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-600 hover:bg-rose-100"
                  title="删除"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>

            {v.script && (
              <details className="border-t border-zinc-100">
                <summary className="cursor-pointer px-3 py-2 text-[11px] text-zinc-500 hover:bg-zinc-50">
                  查看脚本
                </summary>
                <pre className="px-3 py-2 text-[11px] text-zinc-700 whitespace-pre-wrap font-mono leading-relaxed bg-zinc-50/60">
                  {v.script}
                </pre>
              </details>
            )}
          </div>
        );
      })}
      {drawerVideoId && (
        <VideoDetailDrawer
          workspaceId={workspaceId}
          videoId={drawerVideoId}
          onClose={() => setDrawerVideoId(null)}
          onDeleted={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
        />
      )}
    </div>
  );
}
