"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Play, Eye } from "lucide-react";
import { fmt } from "./discover/_components/format";
import { VideoBreakdownModal } from "./video-breakdown-modal";

/**
 * 爆款短视频示例：工作台门面的成片橱窗。
 *
 * 两种形态，组件按是否传入 videos 自动切换：
 *  - 有 videos：临时用真实 EchoTik「带货视频榜」填充（别人的 TikTok 成片，封面 + 点开看 AI 拆解弹层，
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
  /** COS 永久 mp4;非空=站内可直接播放（点击弹层播放，不跳转）。 */
  videoUrl?: string;
};

type Placeholder = { id: string; title: string; angle: string; thumb: string };

// 去渐变：每张占位卡挑原渐变里更深的那个色阶当纯底，保留 5 张卡各自的色彩区分度。
const PLACEHOLDERS: Placeholder[] = [
  { id: "s1", title: "便携榨汁杯", angle: "开箱种草", thumb: "bg-pink-500" },
  { id: "s2", title: "宠物自动喂食器", angle: "痛点解决", thumb: "bg-purple-500" },
  { id: "s3", title: "美妆蛋三件套", angle: "前后对比", thumb: "bg-orange-500" },
  { id: "s4", title: "颈部按摩仪", angle: "卖点速览", thumb: "bg-blue-500" },
  { id: "s5", title: "桌面收纳盒", angle: "场景演示", thumb: "bg-teal-500" },
];

export function SampleVideos({ videos = [] }: { videos?: SampleVid[] }) {
  const hasReal = videos.length > 0;
  const anyPlayable = videos.some((v) => v.videoUrl);
  return (
    <section className="rounded-[22px] border border-black/[0.065] bg-white/55 p-4 shadow-[0_1px_2px_rgba(18,20,25,.02)] sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 text-2xs font-bold uppercase tracking-[0.14em] text-zinc-400">趋势灵感</div>
          <h2 className="font-display text-base font-semibold text-ink">热门带货视频参考</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {!hasReal
              ? "即将上架的选题方向，先占个位"
              : anyPlayable
                ? "TikTok 上正在爆的带货短视频 · 点开看 AI 拆解 · 部分可站内直接播放"
                : "TikTok 上正在爆的带货短视频 · 点开看 AI 拆解"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-black/[0.06] bg-white px-2.5 py-1 text-2xs font-medium text-zinc-500">
          {hasReal ? "实时榜单" : "样片陆续上架"}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {hasReal
          ? videos.map((v) => <RealCard key={v.videoId} v={v} />)
          : PLACEHOLDERS.map((s) => <PlaceholderCard key={s.id} s={s} />)}
      </div>
    </section>
  );
}

/** 真·EchoTik 带货视频：封面 + 播放键 + 播放量 + 文案。
 *  点击一律开拆解弹层（左片右拆解，不跳转）；已转存 COS（videoUrl）的额外可站内播放。 */
function RealCard({ v }: { v: SampleVid }) {
  const [open, setOpen] = useState(false);
  const playable = !!v.videoUrl;

  const inner = (
    <>
      {v.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v.coverUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-zinc-400" />
      )}
      <span aria-hidden className="absolute inset-0 bg-black/10" />

      <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-transform group-hover:scale-110">
        <Play className="h-5 w-5 translate-x-px fill-current" />
      </span>

      {v.views > 0 && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
          <Eye className="h-3 w-3" />
          {fmt(v.views)}
        </span>
      )}

      {playable && (
        <span className="absolute right-2 top-2 rounded-full bg-fuchsia-500/90 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
          站内可播
        </span>
      )}

      {v.desc && (
        <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium leading-snug text-white">
          {v.desc}
        </span>
      )}
    </>
  );

  const cardClass = "group relative aspect-[9/16] w-36 shrink-0 overflow-hidden rounded-[18px] border border-black/10 bg-white text-left shadow-[0_1px_2px_rgba(18,20,25,.03)] transition-shadow hover:shadow-[0_12px_30px_-18px_rgba(18,20,25,.3)] sm:w-40";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={v.desc || undefined} className={cardClass}>
        {inner}
      </button>
      {open && <VideoBreakdownModal v={v} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 占位卡：无真片时只为定版式（点击提示样片即将上线）。 */
function PlaceholderCard({ s }: { s: Placeholder }) {
  return (
    <button
      onClick={() => toast("样片即将上线，敬请期待")}
      title={`${s.title} · ${s.angle}`}
      className="group relative aspect-[9/16] w-36 shrink-0 overflow-hidden rounded-[18px] border border-black/10 bg-white text-left shadow-[0_1px_2px_rgba(18,20,25,.03)] transition-shadow hover:shadow-[0_12px_30px_-18px_rgba(18,20,25,.3)] sm:w-40"
    >
      <span
        aria-hidden
        className={`absolute inset-0 ${s.thumb} transition-transform duration-500 ease-out group-hover:scale-[1.04]`}
      />
      <span aria-hidden className="absolute inset-0 bg-black/10" />

      <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-transform group-hover:scale-110">
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
