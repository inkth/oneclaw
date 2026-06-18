"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Play, Eye } from "lucide-react";
import { fmt } from "./discover/_components/format";

/**
 * 爆款短视频示例：工作台门面的成片橱窗。
 *
 * 两种形态，组件按是否传入 videos 自动切换：
 *  - 有 videos：临时用真实 EchoTik「带货视频榜」填充（别人的 TikTok 成片，封面 + 点开进详情/外链，
 *    非本平台产出，故文案如实写「TikTok 上正在爆」）。
 *  - 无 videos：回落到占位渐变卡，仅为定版式。
 *
 * 待自制样片就绪：把真片做成内联可播（<video muted autoplay loop playsInline>），
 * 文案换回「AI 就能产出这样的带货短视频」，即成「我们的产出」证明。
 */
export type SampleVid = {
  videoId: string;
  region: string;
  coverUrl: string | null;
  desc: string;
  views: number;
};

type Placeholder = { id: string; title: string; angle: string; thumb: string };

const PLACEHOLDERS: Placeholder[] = [
  { id: "s1", title: "便携榨汁杯", angle: "开箱种草", thumb: "from-fuchsia-400 to-pink-500" },
  { id: "s2", title: "宠物自动喂食器", angle: "痛点解决", thumb: "from-violet-400 to-purple-500" },
  { id: "s3", title: "美妆蛋三件套", angle: "前后对比", thumb: "from-amber-400 to-orange-500" },
  { id: "s4", title: "颈部按摩仪", angle: "卖点速览", thumb: "from-sky-400 to-blue-500" },
  { id: "s5", title: "桌面收纳盒", angle: "场景演示", thumb: "from-emerald-400 to-teal-500" },
];

export function SampleVideos({ videos = [] }: { videos?: SampleVid[] }) {
  const hasReal = videos.length > 0;
  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">爆款短视频示例</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {hasReal
              ? "TikTok 上正在爆的带货短视频 · 点开拆解脚本玩法"
              : "一句话派活，AI 就能产出这样的带货短视频"}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">
          {hasReal ? "实时榜单" : "样片陆续上架"}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {hasReal
          ? videos.map((v) => <RealCard key={v.videoId} v={v} />)
          : PLACEHOLDERS.map((s) => <PlaceholderCard key={s.id} s={s} />)}
      </div>
    </div>
  );
}

/** 真·EchoTik 带货视频：封面 + 播放键 + 播放量 + 文案，点开进站内详情（再外链 TikTok）。 */
function RealCard({ v }: { v: SampleVid }) {
  return (
    <Link
      href={`/app/discover/videos/${v.videoId}?region=${v.region}`}
      title={v.desc || undefined}
      className="dk-card lift group relative aspect-[9/16] w-36 shrink-0 overflow-hidden text-left sm:w-40"
    >
      {v.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v.coverUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-gradient-to-br from-zinc-300 to-zinc-400" />
      )}
      <span aria-hidden className="absolute inset-0 bg-black/10" />

      <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-md transition-transform group-hover:scale-110">
        <Play className="h-5 w-5 translate-x-px fill-current" />
      </span>

      {v.views > 0 && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
          <Eye className="h-3 w-3" />
          {fmt(v.views)}
        </span>
      )}

      {v.desc && (
        <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium leading-snug text-white">
          {v.desc}
        </span>
      )}
    </Link>
  );
}

/** 占位卡：无真片时只为定版式（点击提示样片即将上线）。 */
function PlaceholderCard({ s }: { s: Placeholder }) {
  return (
    <button
      onClick={() => toast("样片即将上线，敬请期待")}
      title={`${s.title} · ${s.angle}`}
      className="dk-card lift group relative aspect-[9/16] w-36 shrink-0 overflow-hidden text-left sm:w-40"
    >
      <span aria-hidden className={`absolute inset-0 bg-gradient-to-br ${s.thumb}`} />
      <span aria-hidden className="absolute inset-0 bg-black/10" />

      <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-md transition-transform group-hover:scale-110">
        <Play className="h-5 w-5 translate-x-px fill-current" />
      </span>

      <span className="absolute left-2 top-2 rounded-full bg-black/35 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
        {s.angle}
      </span>

      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white">
        {s.title}
      </span>
    </button>
  );
}
