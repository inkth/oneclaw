"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Loader2,
  Package,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  AGENT_IDENTITY,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type AgentKey,
} from "@/lib/ui/tokens";
import { type ReviewResult } from "@/lib/review/types";
import { ReviewResults } from "./review-panel";
import { ListingResults } from "./listing-results";

export type StreamTask = {
  id: string;
  workspaceId: string;
  agent: string;
  status: string;
  input: string;
  output?: string | null;
  errorMessage?: string | null;
  metadata?: {
    /** REVIEW 任务:完整复盘结果,流内还原仪表盘。 */
    review?: ReviewResult;
    /** ANALYST 任务:写入选品库的商品,externalId 存在时可跳转发现页详情。 */
    products?: {
      id: string;
      title: string;
      roiScore: number;
      recommended?: boolean;
      reason?: string;
      externalId?: string;
      region?: string;
    }[];
    /** DIRECTOR 任务:脚本草稿。draft=true 且无 videoId 时等待用户确认出片。 */
    draft?: boolean;
    videoId?: string;
    durationSec?: number;
    aspectRatio?: string;
    /** LISTING 任务:结构化 Listing 内容;imagesStatus 驱动主图确认生成流程(同出片确认)。 */
    title?: string;
    sellingPoints?: string[];
    aplusSections?: { heading: string; body: string; imagePrompt: string }[];
    imagePrompts?: string[];
    hashtags?: string[];
    images?: string[];
    imagesStatus?: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    coverUrl?: string;
  } | null;
  createdAt: string;
};

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);

const OUTPUT_COLLAPSE_LIMIT = 600;

/**
 * 会话流:每次派活 = 右侧用户气泡(指令)+ 左侧 Agent 气泡(状态/结果)。
 * 新任务在最上方紧贴输入框,执行中实时显示进度,完成后结果就地展开;
 * 所有 Agent 统一落任务表,复盘(REVIEW)从 metadata.review 还原仪表盘。
 */
export function TaskStream({
  items,
  limit,
  moreHref,
}: {
  items: StreamTask[];
  /** 仅展示最近 N 条,溢出时显示「查看全部」链接(工作台首页用)。 */
  limit?: number;
  moreHref?: string;
}) {
  if (items.length === 0) return null;
  const visible = limit ? items.slice(0, limit) : items;
  const overflow = limit ? items.length - visible.length : 0;

  return (
    <div className="space-y-5">
      {visible.map((task, i) => (
        <TaskBubble key={task.id} task={task} newest={i === 0} />
      ))}
      {overflow > 0 && moreHref && (
        <div className="text-center">
          <Link
            href={moreHref}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-ink"
          >
            查看全部 {items.length} 条任务 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1c1d1f] px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
        {children}
      </div>
    </div>
  );
}

function AgentBubble({
  agent,
  status,
  children,
}: {
  agent: string;
  status?: string;
  children: React.ReactNode;
}) {
  const identity = AGENT_IDENTITY[agent as AgentKey];
  const Icon = identity?.icon ?? Bot;
  return (
    <div className="flex justify-start">
      <div className="dk-card max-w-[92%] min-w-0 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
            <Icon className="h-3 w-3" />
          </span>
          <span className="text-xs font-semibold text-ink">{identity?.label ?? agent}</span>
          {status && (
            <Badge tone={TASK_STATUS_TONE[status] ?? "neutral"}>
              {TASK_STATUS_LABEL[status] ?? status}
            </Badge>
          )}
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

/** ANALYST 选品结果:商品 chip 行,有 externalId 时可点击跳发现页详情。 */
function ProductChips({ products }: { products: NonNullable<NonNullable<StreamTask["metadata"]>["products"]> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {products.map((p) => {
        const body = (
          <>
            <Package className="h-3 w-3 shrink-0 text-brand-600" />
            <span className="max-w-[180px] truncate font-medium">{p.title}</span>
            <span className="text-zinc-400">ROI {p.roiScore}</span>
            {p.recommended && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
          </>
        );
        const cls =
          "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-zinc-700";
        return p.externalId ? (
          <Link
            key={p.id}
            href={`/app/discover/products/${p.externalId}?region=${p.region ?? "US"}`}
            title={p.reason}
            className={`${cls} transition-colors hover:border-brand-300 hover:text-brand-700`}
          >
            {body}
          </Link>
        ) : (
          <span key={p.id} title={p.reason} className={cls}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

function TaskBubble({ task, newest = false }: { task: StreamTask; newest?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const review = task.agent === "REVIEW" ? task.metadata?.review : undefined;
  // 最新一条复盘默认展开仪表盘(刚提交完就要看结果),历史折叠省空间。
  const [dashOpen, setDashOpen] = useState(newest);
  const active = ACTIVE_STATUSES.has(task.status);
  const output = task.output ?? "";
  const long = output.length > OUTPUT_COLLAPSE_LIMIT;
  const shown = !long || expanded ? output : output.slice(0, OUTPUT_COLLAPSE_LIMIT) + "…";

  // LISTING 结果有结构化 metadata 时用卡片组渲染(可逐区复制/确认出主图),不再铺纯文本。
  const isListing =
    task.agent === "LISTING" && task.status === "DONE" && !!task.metadata?.title;

  // DIRECTOR 脚本草稿:确认后才真正出片。本地 videoId 覆盖 metadata(确认成功立即切换 UI)。
  const isDirector = task.agent === "DIRECTOR";
  const [confirming, setConfirming] = useState(false);
  const [localVideoId, setLocalVideoId] = useState<string | null>(null);
  const videoId = localVideoId ?? task.metadata?.videoId ?? null;
  const awaitingConfirm =
    isDirector && task.status === "DONE" && !!task.metadata?.draft && !videoId;

  async function confirmVideo() {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}/video`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error?.message || "提交失败,稍后再试");
        return;
      }
      setLocalVideoId(json.data.video.id as string);
      toast.success("已提交视频生成,约 1-2 分钟出片");
    } catch {
      toast.error("网络异常,稍后再试");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-2">
      <UserBubble>{task.input}</UserBubble>
      <AgentBubble agent={task.agent} status={task.status}>
        {active ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {task.status === "QUEUED" ? "排队中,马上开始…" : "正在工作,结果会出现在这里…"}
          </div>
        ) : task.status === "FAILED" ? (
          <div className="text-sm leading-relaxed text-rose-600">
            {task.errorMessage || "执行失败,请稍后重试"}
          </div>
        ) : isListing ? (
          <ListingResults task={task} />
        ) : (
          <>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
              {shown || "(无输出)"}
            </div>
            {long && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 text-xs font-medium text-zinc-500 hover:text-ink"
              >
                {expanded ? "收起" : "展开全部"}
              </button>
            )}
            {!!task.metadata?.products?.length && <ProductChips products={task.metadata.products} />}
            {awaitingConfirm && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={confirmVideo}
                  disabled={confirming}
                  className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50 disabled:pointer-events-none"
                >
                  {confirming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clapperboard className="h-3.5 w-3.5" />
                  )}
                  {confirming ? "提交中…" : "生成视频"}
                </button>
                <span className="text-2xs text-zinc-400">
                  {task.metadata?.durationSec ?? 5}s · {task.metadata?.aspectRatio ?? "9:16"} ·
                  确认后才开始消耗生成额度
                </span>
              </div>
            )}
            {isDirector && task.status === "DONE" && videoId && (
              <Link
                href="/app/videos"
                className="mt-3 inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <Clapperboard className="h-3 w-3" />
                去短视频墙查看成片 <ArrowRight className="h-3 w-3" />
              </Link>
            )}
            {review && (
              <button
                onClick={() => setDashOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink"
              >
                {dashOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {dashOpen ? "收起仪表盘" : "展开复盘仪表盘"}
              </button>
            )}
          </>
        )}
      </AgentBubble>
      {review && dashOpen && (
        <div className="pt-1">
          <ReviewResults result={review} />
        </div>
      )}
    </div>
  );
}
