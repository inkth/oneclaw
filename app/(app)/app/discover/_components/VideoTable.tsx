"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { RankMedal } from "@/components/ui/RankMedal";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Thumb } from "./shared";
import { fmt, fmtMoney, fmtDuration, fmtUnixDate } from "./format";

/**
 * 短视频列表统一形态：桌面端数据表（封面+标题 | 达人 | 播放/点赞/评论/转发/赞播率 | 销量/GMV | 操作），
 * 移动端退化为紧凑横排卡。视频榜、商品详情、达人详情的视频列表都走这里。
 */
export type VideoRow = {
  videoId: string;
  cover: string | null;
  /** 展示标题（中文优先）。 */
  title: string;
  /** 原文标题（有中文译文时挂 title 提示）。 */
  titleAlt?: string;
  duration?: number;
  /** unix 秒。 */
  createTime?: string | number;
  isAd?: boolean;
  author?: { name: string; uniqueId?: string; avatar?: string | null; region?: string };
  views: number;
  digg: number;
  comments: number;
  shares: number;
  saleCnt: number;
  saleGmv: number;
  /** 站内详情页；点击视频/标题优先走这里。 */
  href?: string;
  /** 外部播放地址（TikTok / playAddr），渲染成「播放」图标钮。 */
  playUrl?: string;
};

/** 赞播率 = 点赞 ÷ 播放。上游 0 = 缺失，任一缺失则不算。 */
function likeRate(digg: number, views: number): string | null {
  if (digg <= 0 || views <= 0) return null;
  return `${((digg / views) * 100).toFixed(1)}%`;
}

/** 数值格：0 视为上游缺失，渲染 —（与商品榜口径一致）。 */
function Num({ v }: { v: number }) {
  return v > 0 ? <>{fmt(v)}</> : <span className="font-normal text-zinc-300">—</span>;
}

export function VideoTable({
  rows,
  showRank = false,
  periodLabel = "",
  className,
}: {
  rows: VideoRow[];
  /** 榜单场景显示名次列。 */
  showRank?: boolean;
  /** 榜单数值的周期前缀（如「近7天」）；空 = 累计口径。 */
  periodLabel?: string;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const showAuthor = rows.some((r) => r.author);
  const p = periodLabel;
  const minWidth = 860 + (showRank ? 40 : 0) + (showAuthor ? 170 : 0);

  return (
    <div className={className}>
      {/* 移动端：紧凑横排卡（表格横滚在小屏体验差） */}
      <div className="space-y-2.5 md:hidden">
        {rows.map((r, idx) => (
          <MobileCard key={r.videoId} r={r} rank={showRank ? idx + 1 : undefined} periodLabel={p} />
        ))}
      </div>

      <TableWrap className="hidden md:block" minWidth={minWidth}>
        <THead>
          <tr>
            {showRank && <Th>#</Th>}
            <Th>视频</Th>
            {showAuthor && <Th>达人</Th>}
            <Th align="right" className="whitespace-nowrap">{p ? `${p}播放` : "播放量"}</Th>
            <Th align="right" className="whitespace-nowrap">{p ? `${p}点赞` : "点赞数"}</Th>
            <Th align="right" className="whitespace-nowrap">{p ? `${p}评论` : "评论数"}</Th>
            <Th align="right" className="whitespace-nowrap">{p ? `${p}转发` : "转发数"}</Th>
            <Th align="right" className="whitespace-nowrap">
              <span title="点赞数 ÷ 播放量，衡量内容质量" className="cursor-help">
                赞播率
              </span>
            </Th>
            <Th align="right" className="whitespace-nowrap">{p ? `${p}销量` : "带货销量"}</Th>
            <Th align="right" className="whitespace-nowrap">{p ? `${p} GMV` : "带货 GMV"}</Th>
            <Th align="right">操作</Th>
          </tr>
        </THead>
        <tbody>
          {rows.map((r, idx) => {
            const rate = likeRate(r.digg, r.views);
            return (
              <Tr key={r.videoId}>
                {showRank && (
                  <Td>
                    <RankMedal rank={idx + 1} />
                  </Td>
                )}
                <Td className="max-w-[320px]">
                  <VideoCellLink r={r} className="group flex items-start gap-2.5">
                    <div className="relative shrink-0">
                      <Thumb src={r.cover} name={r.title || r.videoId} className="h-16 w-12 rounded-lg" />
                      {typeof r.duration === "number" && r.duration > 0 && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-px text-2xs font-medium text-white tabular-nums">
                          {fmtDuration(r.duration)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className="line-clamp-2 font-medium leading-snug transition-colors group-hover:text-brand-700"
                        title={r.titleAlt ? `${r.title}\n${r.titleAlt}` : r.title}
                      >
                        {r.title || "(无描述)"}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-2xs text-zinc-400">
                        {r.createTime ? <span>{fmtUnixDate(r.createTime)}</span> : null}
                        {r.isAd && (
                          <Badge tone="warning" outline={false}>
                            付费流量
                          </Badge>
                        )}
                      </div>
                    </div>
                  </VideoCellLink>
                </Td>
                {showAuthor && (
                  <Td className="max-w-[180px]">
                    {r.author ? (
                      <div className="flex items-center gap-2">
                        <Thumb src={r.author.avatar ?? null} name={r.author.name} className="h-8 w-8 rounded-full" rounded />
                        <div className="min-w-0">
                          <div className="truncate font-medium" title={r.author.name}>
                            {r.author.name || "—"}
                          </div>
                          <div className="truncate text-2xs text-zinc-400">
                            {r.author.uniqueId ? `@${r.author.uniqueId}` : r.author.region || ""}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </Td>
                )}
                <Td align="right" className="font-semibold">
                  <Num v={r.views} />
                </Td>
                <Td align="right">
                  <Num v={r.digg} />
                </Td>
                <Td align="right">
                  <Num v={r.comments} />
                </Td>
                <Td align="right">
                  <Num v={r.shares} />
                </Td>
                <Td align="right">{rate ?? <span className="text-zinc-300">—</span>}</Td>
                <Td align="right" className="font-semibold">
                  <Num v={r.saleCnt} />
                </Td>
                <Td align="right" className="text-emerald-700">
                  {r.saleGmv > 0 ? fmtMoney(r.saleGmv) : <span className="text-zinc-300">—</span>}
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.playUrl && (
                      <a
                        href={r.playUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="播放视频"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dk-stroke-border)] bg-white text-zinc-600 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--dk-btn-tertiary)] hover:text-zinc-900"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </a>
                    )}
                    {r.href && (
                      <ButtonLink href={r.href} size="sm" className="rounded-lg px-2.5" title="查看详情与 AI 拆解">
                        详情
                      </ButtonLink>
                    )}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableWrap>
    </div>
  );
}

/** 视频格的点击目标：优先站内详情，其次外部播放，都没有则纯展示。 */
function VideoCellLink({
  r,
  className,
  children,
}: {
  r: VideoRow;
  className: string;
  children: React.ReactNode;
}) {
  if (r.href) {
    return (
      <Link href={r.href} className={className}>
        {children}
      </Link>
    );
  }
  if (r.playUrl) {
    return (
      <a href={r.playUrl} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return <div className={className}>{children}</div>;
}

function MobileCard({ r, rank, periodLabel }: { r: VideoRow; rank?: number; periodLabel: string }) {
  const rate = likeRate(r.digg, r.views);
  const inner = (
    <>
      <div className="relative shrink-0">
        <Thumb src={r.cover} name={r.title || r.videoId} className="h-20 w-14 rounded-lg" />
        {rank !== undefined && (
          <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-ink px-1 text-[9px] font-bold text-white tabular-nums">
            {rank}
          </span>
        )}
        {typeof r.duration === "number" && r.duration > 0 && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-px text-2xs font-medium text-white tabular-nums">
            {fmtDuration(r.duration)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="line-clamp-2 text-xs font-medium leading-snug text-zinc-900"
          title={r.titleAlt ? `${r.title}\n${r.titleAlt}` : r.title}
        >
          {r.title || "(无描述)"}
        </div>
        {r.author && (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-2xs text-zinc-500">
            <Thumb src={r.author.avatar ?? null} name={r.author.name} className="h-4 w-4 rounded-full" rounded />
            <span className="truncate">{r.author.name}</span>
            {r.isAd && (
              <Badge tone="warning" outline={false}>
                付费流量
              </Badge>
            )}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-zinc-500 tabular-nums">
          {r.views > 0 && <span>{periodLabel}播放 {fmt(r.views)}</span>}
          {r.digg > 0 && <span>点赞 {fmt(r.digg)}</span>}
          {rate && <span>赞播率 {rate}</span>}
          {r.saleCnt > 0 && <span className="font-semibold text-zinc-900">销量 {fmt(r.saleCnt)}</span>}
          {r.saleGmv > 0 && <span className="font-semibold text-emerald-700">{fmtMoney(r.saleGmv)}</span>}
        </div>
      </div>
    </>
  );
  const shell = "dk-card dk-lift flex items-start gap-3 p-3";
  if (r.href) {
    return (
      <Link href={r.href} className={shell}>
        {inner}
      </Link>
    );
  }
  if (r.playUrl) {
    return (
      <a href={r.playUrl} target="_blank" rel="noopener noreferrer" className={shell}>
        {inner}
      </a>
    );
  }
  return <div className={shell}>{inner}</div>;
}
