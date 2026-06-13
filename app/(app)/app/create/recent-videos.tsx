import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clapperboard, Loader2 } from "lucide-react";

export type RecentVideo = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  processing: string; // PENDING | GENERATING | COMPLETED | FAILED
  durationSec: number;
};

/**
 * 创作页底部的最近成片条:横滚 9:16 缩略图,点击进短视频墙。
 * 纯展示不轮询(生成中的状态变化去短视频墙看,那边有自动刷新)。
 */
export function RecentVideos({ videos }: { videos: RecentVideo[] }) {
  if (videos.length === 0) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">最近成片</h2>
        <Link
          href="/app/videos"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-ink"
        >
          全部成片 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {videos.map((v) => {
          const generating = v.processing === "PENDING" || v.processing === "GENERATING";
          const failed = v.processing === "FAILED";
          return (
            <Link
              key={v.id}
              href="/app/videos"
              title={v.title}
              className="dk-card lift relative aspect-[9/16] w-24 shrink-0 overflow-hidden sm:w-28"
            >
              {v.thumbnailUrl ? (
                <Image
                  src={v.thumbnailUrl}
                  alt={v.title}
                  fill
                  sizes="112px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-zinc-100">
                  <Clapperboard className="h-5 w-5 text-zinc-300" />
                </span>
              )}
              {generating && (
                <span className="absolute inset-x-1.5 top-1.5 inline-flex items-center justify-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  生成中
                </span>
              )}
              {failed && (
                <span className="absolute inset-x-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-rose-500/90 px-1.5 py-0.5 text-2xs font-medium text-white">
                  失败
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-2xs text-white">
                {v.title}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
