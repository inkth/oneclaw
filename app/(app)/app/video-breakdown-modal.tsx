"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Clapperboard, Eye, Sparkles, X } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { fmt } from "./discover/_components/format";
import { VideoAnalysisResult, type VideoAnalysisData } from "./video-analysis-result";

/**
 * 视频拆解弹层:点开橱窗/榜单里的一条爆款,左看片右看拆解,不跳出当前页。
 *
 * 拆解是首页最有说服力的东西,藏在详情页后面等于放在跳出率最高的一跳之后 ——
 * 所以浏览态在这个弹层里看完就走,唯一出口是「做视频」,不给跳详情页的岔路。
 * 详情页降级为分享/深链接的落点(那里的拆解默认折叠,不抢商品与带货数据的位)。
 *
 * analysis 不在榜单接口里,故按需拉一次视频详情(公开端点,游客可见)。
 */

type DetailDTO = {
  videoId: string;
  region: string;
  desc: string;
  descZh: string;
  cover: string;
  views: number;
  videoUrl: string;
  analysis: VideoAnalysisData | null;
};

export type BreakdownTarget = {
  videoId: string;
  region: string;
  coverUrl: string | null;
  desc: string;
  views: number;
  /** COS 永久 mp4;空=未转存,弹层左栏退回封面图。 */
  videoUrl?: string;
};

export function VideoBreakdownModal({
  v,
  onClose,
}: {
  v: BreakdownTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<DetailDTO | null>(null);
  const [failed, setFailed] = useState(false);

  // 榜单已有的字段先用着,详情回来再覆盖 —— 弹层开瞬间就有内容,不是一片骨架。
  const videoUrl = detail?.videoUrl || v.videoUrl || "";
  const cover = detail?.cover || v.coverUrl || "";
  const desc = detail?.descZh || detail?.desc || v.desc;

  useEffect(() => {
    let alive = true;
    apiBrowser<{ video: DetailDTO | null }>(
      `/discover/videos/${v.videoId}?region=${v.region}`,
    )
      .then((r) => {
        if (!alive) return;
        if (r.video) setDetail(r.video);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [v.videoId, v.region]);

  // Esc 关闭 + 锁背景滚动(弹层自身内部滚动)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // 「用这个结构做视频」:把拆出来的钩子/痛点/卖点/CTA 写进派活指令,导演拿到的是结构不是链接。
  // 每段掐到 clip() 的长度 —— 拆解原文是整段描述,全量灌进去会撑爆输入框且用户没法改。
  const relay = useCallback(() => {
    const s = detail?.analysis?.structure;
    const parts = [
      s?.hook && `钩子「${clip(s.hook)}」`,
      s?.pain && `痛点「${clip(s.pain)}」`,
      s?.selling && `卖点「${clip(s.selling)}」`,
      s?.cta && `促单「${clip(s.cta)}」`,
    ].filter(Boolean);
    const prompt = parts.length
      ? `参考这条 TikTok 爆款的带货结构,做一条我的商品短视频:${parts.join("、")}。`
      : `参考这条 TikTok 爆款做一条带货短视频。原片文案:${clip(desc, 50)}`;
    router.push(`/app?agent=DIRECTOR&prompt=${encodeURIComponent(prompt)}`);
    onClose();
  }, [detail, desc, router, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="视频拆解"
        onClick={(e) => e.stopPropagation()}
        className="dk-card relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden bg-white sm:flex-row"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-white sm:right-auto sm:left-3"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 左栏:竖版片源(9:16 天然窄)。未转存 mp4 时退回封面图。 */}
        <div className="shrink-0 bg-zinc-900 sm:w-[260px]">
          {videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              poster={cover || undefined}
              controls
              autoPlay
              playsInline
              className="mx-auto aspect-[9/16] max-h-[40vh] w-auto object-contain sm:max-h-none sm:h-full sm:w-full"
            />
          ) : cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="mx-auto aspect-[9/16] max-h-[40vh] w-auto object-cover sm:max-h-none sm:h-full sm:w-full"
            />
          ) : (
            <div className="aspect-[9/16] w-full" />
          )}
        </div>

        {/* 右栏:拆解正文 + 底部固定 CTA。min-h-0/min-w-0 缺一不可 ——
            否则 flex 子项按内容撑开,移动端(column)会把底部 CTA 顶出 overflow-hidden 之外。 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-fuchsia-500" />
              <span className="text-sm font-medium text-ink">AI 拆解</span>
              <span className="text-xs text-zinc-400">这条为什么爆 · 可直接借鉴</span>
            </div>

            {desc && (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500">{desc}</p>
            )}
            {v.views > 0 && (
              <span className="mt-1.5 inline-flex items-center gap-1 text-2xs text-zinc-400">
                <Eye className="h-3 w-3" />
                {fmt(v.views)} 次播放
              </span>
            )}

            {!detail && !failed && <BreakdownSkeleton />}
            {detail?.analysis && <VideoAnalysisResult data={detail.analysis} />}
            {((detail && !detail.analysis) || failed) && (
              <p className="mt-4 rounded-lg border border-[var(--dk-stroke-border)] bg-[var(--dk-surface-2)] px-3 py-3 text-xs leading-relaxed text-zinc-500">
                {failed
                  ? "拆解暂时取不到,稍后再试。"
                  : "这条还没排到 AI 拆解(仅销量较高的视频会自动拆解)。你仍可先看片,或换一条试试。"}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--dk-stroke-border)] bg-white px-5 py-3">
            <button
              type="button"
              onClick={relay}
              className="press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--dk-btn-black)] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--dk-btn-black-hover)]"
            >
              <Clapperboard className="h-3.5 w-3.5" />
              用这个结构做视频
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 掐到 n 字,优先在句读处断,避免半句话。 */
function clip(s: string, n = 34): string {
  const t = s.trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n);
  const cut = Math.max(head.lastIndexOf("，"), head.lastIndexOf("。"), head.lastIndexOf("、"));
  return (cut >= n / 2 ? head.slice(0, cut) : head) + "…";
}

function BreakdownSkeleton() {
  return (
    <div className="mt-4 space-y-2" aria-label="拆解加载中">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg bg-[var(--dk-surface-2)]"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}
