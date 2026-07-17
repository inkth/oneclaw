"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Play, Download, Trash2, Video, WandSparkles } from "lucide-react";
import { VideoDetailDrawer } from "@/components/VideoDetailDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaPlaceholder } from "@/components/ui/MediaPlaceholder";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { authFetch } from "@/lib/api-browser";
import { useConfirm } from "@/components/ui/ConfirmDialog";

type Processing = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

type Video = {
  id: string;
  title: string;
  style: string;
  durationSec: number;
  realClipSec?: number;
  aspectRatio?: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  script: string | null;
  processing: Processing;
  errorMessage?: string | null;
  productTitle: string | null;
  createdAt: string;
};

// 与后端 videoPageSize 对齐:一页拿满说明可能还有下一页,露出「加载更多」。
const PAGE_SIZE = 60;

const styleMap: Record<string, { label: string }> = {
  UNBOXING: { label: "Unboxing" },
  COMPARISON: { label: "对比测评" },
  SCENE: { label: "生活场景" },
  BEFORE_AFTER: { label: "Before/After" },
};

export function VideosClient({
  workspaceId,
  initialVideos,
}: {
  workspaceId: string;
  initialVideos: Video[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [drawerVideoId, setDrawerVideoId] = useState<string | null>(null);
  // 首屏拿满一页才可能有下一页;点「加载更多」按 offset 续拉。
  const [hasMore, setHasMore] = useState(initialVideos.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  // 自动轮询所有 GENERATING 视频
  useEffect(() => {
    const pending = videos.filter((v) => v.processing === "GENERATING");
    if (pending.length === 0) return;

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        pending.map((v) =>
          authFetch(`/api/v1/workspaces/${workspaceId}/videos/${v.id}/refresh`, {
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
    const res = await authFetch(`/api/v1/workspaces/${workspaceId}/videos/${id}/refresh`, {
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

  async function retryVideo(id: string) {
    setRetryingId(id);
    const res = await authFetch(`/api/v1/workspaces/${workspaceId}/videos/${id}/retry`, {
      method: "POST",
    });
    const json = await res.json().catch(() => null);
    setRetryingId(null);
    if (res.ok && json?.ok && json.data.video) {
      // 状态切回 GENERATING 后，既有轮询 effect 会自动接管
      setVideos((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...json.data.video } : v)),
      );
    }
  }

  // 重出后重新拉首页列表：新片（GENERATING）即时上墙，既有轮询接管后续状态。
  async function reload() {
    const res = await authFetch(`/api/v1/workspaces/${workspaceId}/videos`);
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok && Array.isArray(json.data?.videos)) {
      const page = json.data.videos as Video[];
      setVideos(page);
      setHasMore(page.length >= PAGE_SIZE);
    }
  }

  // 加载下一页并追加（按当前已有条数作 offset，删除/重出后也不会跳页错位太多）。
  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await authFetch(
        `/api/v1/workspaces/${workspaceId}/videos?offset=${videos.length}`,
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && Array.isArray(json.data?.videos)) {
        const page = json.data.videos as Video[];
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...page.filter((v) => !seen.has(v.id))];
        });
        setHasMore(page.length >= PAGE_SIZE);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function deleteVideo(id: string) {
    const ok = await confirm({
      title: "删除这条视频？",
      description: "删除后无法恢复，已消耗的积分不退回。",
      confirmLabel: "删除",
      tone: "danger",
    });
    if (!ok) return;
    const res = await authFetch(`/api/v1/workspaces/${workspaceId}/videos/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      router.refresh();
    }
  }

  if (videos.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="视频"
          description="查看生成进度、播放成片并继续优化脚本。"
          actions={
            <ButtonLink href="/app?agent=DIRECTOR#agent-composer" variant="primary" size="sm">
              <WandSparkles className="h-3.5 w-3.5" />
              制作视频
            </ButtonLink>
          }
        />
        <EmptyState
          icon={Video}
          title="还没有生成的视频"
          description="回到工作台选择「短视频创作」，添加商品并说明目标，Agent 会自动选择合适的内容角度。"
          action={
            <ButtonLink href="/app?agent=DIRECTOR#agent-composer" variant="secondary" size="sm">
              开始第一条视频
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="视频"
        description="查看生成进度、播放成片并继续优化脚本。"
        actions={
          <ButtonLink href="/app?agent=DIRECTOR#agent-composer" variant="primary" size="sm">
            <WandSparkles className="h-3.5 w-3.5" />
            制作视频
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((v) => {
          const style = styleMap[v.style] ?? styleMap.UNBOXING;
          const isGenerating = v.processing === "GENERATING";
          const isFailed = v.processing === "FAILED";
          return (
            <div
              key={v.id}
              className="dk-card dk-lift group flex flex-col overflow-hidden"
            >
            <div
              className="relative"
              style={{ aspectRatio: (v.aspectRatio ?? "9:16").replace(":", " / ") }}
            >
              {v.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbnailUrl}
                  alt={v.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <MediaPlaceholder seed={v.id} icon={Video} rounded="rounded-none" className="absolute inset-0" />
              )}
              {/* 去渐变（硬规则）:封面遮罩改纯色半透明黑，只为给上下叠字/徽章提对比度 */}
              <div className="absolute inset-0 bg-black/25" />

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
                    <div className="glow-pulse rounded-full bg-black/50 backdrop-blur px-3 py-1.5 text-2xs font-medium text-white inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      生成中…
                    </div>
                  ) : isFailed ? (
                    <div
                      className="rounded-full bg-rose-500/80 backdrop-blur px-3 py-1.5 text-2xs font-medium text-white inline-flex items-center gap-1.5"
                      title={v.errorMessage ?? undefined}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      生成失败
                    </div>
                  ) : v.thumbnailUrl ? (
                    <div className="rounded-full bg-white/90 px-3 py-1.5 text-2xs font-medium text-zinc-900 inline-flex items-center gap-1">
                      <Play className="h-3 w-3 fill-current" />
                      仅封面
                    </div>
                  ) : null}
                </div>
              )}

              <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-2xs font-medium text-zinc-900">
                {/* durationSec 是 AI 生成秒数（计费口径），成片总长要加实拍开场 */}
                {v.aspectRatio ?? "9:16"} · {v.durationSec + (v.realClipSec ?? 0)}s
              </div>
              {v.processing === "COMPLETED" && v.videoUrl && (
                <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-2xs font-medium text-white">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  已出片
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-3 text-white pointer-events-none">
                <div className="text-xs font-semibold truncate">{v.title}</div>
              </div>
            </div>

            <div className="px-3 py-2.5 flex items-center justify-between text-2xs text-zinc-500 border-t border-[var(--dk-stroke-divider)]">
              <button
                onClick={() => setDrawerVideoId(v.id)}
                className="truncate text-left hover:text-brand-600 transition-colors"
                title="查看详情"
              >
                {v.productTitle ?? "未关联选品"} · 详情 ›
              </button>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="rounded-full bg-[var(--dk-surface-2)] px-1.5 py-0.5">
                  {style.label}
                </span>
                {v.videoUrl && (
                  <a
                    href={v.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`${v.title}.mp4`}
                    className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-100"
                    title="下载视频保存到本地"
                  >
                    <Download className="h-2.5 w-2.5" />
                  </a>
                )}
                {isFailed && (
                  <button
                    onClick={() => retryVideo(v.id)}
                    disabled={retryingId === v.id}
                    className="inline-flex items-center gap-0.5 rounded-full bg-[var(--dk-btn-tertiary)] px-1.5 py-0.5 text-zinc-900 hover:bg-[var(--dk-btn-tertiary-hover)] disabled:opacity-50"
                    title="沿用原参数重新提交生成"
                  >
                    <RefreshCw
                      className={`h-2.5 w-2.5 ${retryingId === v.id ? "animate-spin" : ""}`}
                    />
                    重试
                  </button>
                )}
                {isGenerating && (
                  <button
                    onClick={() => refresh(v.id)}
                    disabled={refreshingId === v.id}
                    className="inline-flex items-center gap-0.5 rounded-full bg-[var(--dk-btn-tertiary)] px-1.5 py-0.5 text-zinc-900 hover:bg-[var(--dk-btn-tertiary-hover)] disabled:opacity-50"
                    title="检查生成状态"
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
              <details className="border-t border-[var(--dk-stroke-divider)]">
                <summary className="cursor-pointer px-3 py-2 text-2xs text-zinc-500 hover:bg-[var(--dk-action-regular)]">
                  查看脚本
                </summary>
                <pre className="px-3 py-2 text-2xs text-zinc-600 whitespace-pre-wrap font-mono leading-relaxed bg-[var(--dk-surface-2)]">
                  {v.script}
                </pre>
              </details>
            )}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="press inline-flex items-center gap-1.5 rounded-full border border-[var(--dk-stroke-border)] bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loadingMore ? "加载中…" : "加载更多"}
          </button>
        </div>
      )}
      {drawerVideoId && (
        <VideoDetailDrawer
          workspaceId={workspaceId}
          videoId={drawerVideoId}
          onClose={() => setDrawerVideoId(null)}
          onDeleted={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
          onRerendered={reload}
        />
      )}
    </div>
  );
}
