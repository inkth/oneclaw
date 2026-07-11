"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Globe,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Star,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CreditCost } from "@/components/ui/CreditCost";
import { CREDIT_COST } from "@/lib/credits";
import {
  AGENT_IDENTITY,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type AgentKey,
} from "@/lib/ui/tokens";
import { type ReviewResult } from "@/lib/review/types";
import { authFetch } from "@/lib/api-browser";
import { REGIONS, REGION_LANG, type Region } from "./discover/_components/regions";
import { ReviewResults } from "./review-panel";
import { ListingResults } from "./listing-results";
import { TryOnResult } from "./try-on-result";
import { VideoAnalysisResult } from "./video-analysis-result";
import { usePersonas } from "./use-personas";

export type StreamTask = {
  id: string;
  workspaceId: string;
  conversationId: string;
  agent: string;
  status: string;
  input: string;
  output?: string | null;
  errorMessage?: string | null;
  metadata?: {
    /** REVIEW 任务:完整复盘结果,流内还原仪表盘。 */
    review?: ReviewResult;
    /** ANALYST 任务:写入收藏的商品,externalId 存在时可跳转发现页详情。 */
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
    /** 目标市场 code 与口播语言(后端按市场母语生成;旧任务无此字段视同美国/英语)。 */
    region?: string;
    voiceLang?: string;
    /** 确认出片时选择的人设(后端回写);preferredPersonaId 是派活时预选的,作确认默认值。 */
    personaId?: string;
    personaName?: string;
    preferredPersonaId?: string;
    /** LISTING 任务:结构化 Listing 内容;imagesStatus 驱动主图确认生成流程(同出片确认)。 */
    title?: string;
    sellingPoints?: string[];
    aplusSections?: { heading: string; body: string; imagePrompt: string }[];
    imagePrompts?: string[];
    hashtags?: string[];
    images?: string[];
    imagesStatus?: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    coverUrl?: string;
    /** 关联选品库商品 ID:出图后可「设为商品主图」回写。 */
    productId?: string;
    /** TRYON 任务:试穿输入图(模特 / 服饰),结果图落 images;失败时 imagesError 给可操作原因。 */
    modelUrl?: string;
    garmentUrl?: string;
    imagesError?: string;
    /** VIDEO_ANALYSIS 任务:逐句脚本 + 中文翻译 + 带货结构拆解 + 改编建议(kind="videoAnalysis")。 */
    kind?: string;
    videoUrl?: string;
    lang?: string;
    summary?: string;
    lines?: { t?: string; original?: string; zh?: string }[];
    structure?: { hook?: string; pain?: string; selling?: string; cta?: string };
    reusablePoints?: string[];
    adaptations?: string[];
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
  chronological = false,
}: {
  items: StreamTask[];
  /** 仅展示最近 N 条,溢出时显示「查看全部」链接(工作台首页用)。 */
  limit?: number;
  moreHref?: string;
  /** 正序排列(旧→新,最新一条在底部),用于底部输入框的聊天布局;默认新→旧(倒序)。 */
  chronological?: boolean;
}) {
  if (items.length === 0) return null;
  // items 传入为新→旧(状态顺序)。聊天布局反转为旧→新,最新一条排在最底、紧贴底部输入框。
  const visible = chronological
    ? [...items].reverse()
    : limit
      ? items.slice(0, limit)
      : items;
  const newestIndex = chronological ? visible.length - 1 : 0;
  const overflow = !chronological && limit ? items.length - visible.length : 0;

  return (
    <div className="space-y-5">
      {visible.map((task, i) => (
        <TaskBubble key={task.id} task={task} newest={i === newestIndex} />
      ))}
      {overflow > 0 && moreHref && (
        <div className="text-center">
          <Link
            href={moreHref}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-ink"
          >
            查看全部 {items.length} 条对话 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg rounded-br-md bg-[var(--dk-btn-black)] px-4 py-2.5 text-sm leading-relaxed text-white shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]">
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
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--dk-surface-2)] text-zinc-600">
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
          "inline-flex items-center gap-1.5 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 py-1 text-xs text-zinc-600";
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

/** 出片人设选择:默认「不用人设」,可选预置数字人 / 自有模特(头像 chip 横排)。 */
function PersonaPicker({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const options = usePersonas(workspaceId);

  if (!options || options.length === 0) return null;

  const chipBase =
    "press inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors";
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
      <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-zinc-400">
        <UserRound className="h-3 w-3" /> 出镜人设
      </span>
      <button
        onClick={() => onChange(null)}
        className={`${chipBase} ${
          value === null
            ? "border-brand-400 bg-[var(--dk-action-regular)] text-brand-700"
            : "border-[var(--dk-stroke-border)] bg-white text-zinc-600 hover:border-zinc-300"
        }`}
      >
        不用人设
      </button>
      {options.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(value === m.id ? null : m.id)}
          title={m.style ?? undefined}
          className={`${chipBase} ${
            value === m.id
              ? "border-brand-400 bg-[var(--dk-action-regular)] text-brand-700"
              : "border-[var(--dk-stroke-border)] bg-white text-zinc-600 hover:border-zinc-300"
          }`}
        >
          {m.avatarUrl ? (
            <Image
              src={m.avatarUrl}
              alt={m.name}
              width={16}
              height={16}
              unoptimized
              className="h-4 w-4 rounded-full object-cover"
            />
          ) : (
            <UserRound className="h-3 w-3 text-zinc-400" />
          )}
          {m.name}
        </button>
      ))}
    </div>
  );
}

function TaskBubble({
  task,
  newest = false,
}: {
  task: StreamTask;
  newest?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // 确认卡改目标市场会触发后端重写脚本,完成后用返回的新任务就地覆盖展示(脚本/口播语言一起换)。
  const [localTask, setLocalTask] = useState<StreamTask | null>(null);
  const t = localTask ?? task;
  const review = t.agent === "REVIEW" ? t.metadata?.review : undefined;
  // 最新一条复盘默认展开仪表盘(刚提交完就要看结果),历史折叠省空间。
  const [dashOpen, setDashOpen] = useState(newest);
  const active = ACTIVE_STATUSES.has(t.status);
  const output = t.output ?? "";
  const long = output.length > OUTPUT_COLLAPSE_LIMIT;
  const shown = !long || expanded ? output : output.slice(0, OUTPUT_COLLAPSE_LIMIT) + "…";

  // LISTING 结果有结构化 metadata 时用卡片组渲染(可逐区复制/确认出主图),不再铺纯文本。
  const isListing = t.agent === "LISTING" && t.status === "DONE" && !!t.metadata?.title;

  // TRYON 虚拟试穿:DONE 后异步出图,按 imagesStatus 自轮询展示上身图。
  const isTryOn = t.agent === "TRYON" && t.status === "DONE";

  // VIDEO_ANALYSIS 视频解析:DONE 后用结构化面板渲染脚本/翻译/带货拆解/改编建议。
  const isVideoAnalysis = t.agent === "VIDEO_ANALYSIS" && t.status === "DONE";

  // DIRECTOR 脚本草稿:确认后才真正出片。本地 videoId 覆盖 metadata(确认成功立即切换 UI)。
  const isDirector = t.agent === "DIRECTOR";
  const [confirming, setConfirming] = useState(false);
  const [localVideoId, setLocalVideoId] = useState<string | null>(null);
  const [redrafting, setRedrafting] = useState(false);
  // 重写期间提示用的目标语言(选中市场的母语)
  const [pendingLang, setPendingLang] = useState("");
  // 一句话重写:输入框文本 + 重写中状态(留空=直接换一版)
  const [rewriteText, setRewriteText] = useState("");
  const [rewriting, setRewriting] = useState(false);
  // 失败任务一键重试:后端沿用原指令 + metadata 还原的派活选项重跑。
  const [retrying, setRetrying] = useState(false);
  // 派活时在创作页预选过人设的,确认出片默认沿用(仍可换/取消)
  const [personaId, setPersonaId] = useState<string | null>(
    task.metadata?.preferredPersonaId ?? null,
  );
  const videoId = localVideoId ?? t.metadata?.videoId ?? null;
  const awaitingConfirm =
    isDirector && t.status === "DONE" && !!t.metadata?.draft && !videoId;
  // 旧任务(改版前生成)metadata 无 region:后端按 US/英语兜底,展示同口径。
  const market = (t.metadata?.region as Region) ?? "US";
  const voiceLang = t.metadata?.voiceLang ?? REGION_LANG[market] ?? "英语";

  // 改目标市场 → 用新市场母语重写脚本草稿(纯文本调用,不消耗积分)→ 轮询取回新脚本。
  async function changeMarket(region: Region) {
    if (redrafting || confirming || rewriting || region === market) return;
    const lang = REGION_LANG[region];
    setRedrafting(true);
    setPendingLang(lang);
    try {
      const res = await authFetch(
        `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}/redraft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ region }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error?.message || "重写失败,稍后再试");
        return;
      }
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const cur = await authFetch(
          `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}`,
          { credentials: "include" },
        );
        const cj = await cur.json().catch(() => null);
        const nt = cj?.data?.task as StreamTask | undefined;
        if (!nt || ACTIVE_STATUSES.has(nt.status)) continue;
        if (nt.status === "DONE") {
          setLocalTask({ ...task, status: nt.status, output: nt.output, metadata: nt.metadata });
          // 失败时后端回滚 DONE 并保留原 metadata,region 不变即未生效
          if (nt.metadata?.region === region) toast.success(`已切换为${lang}口播脚本`);
          else toast.error("重写失败,已保留原脚本");
        } else {
          toast.error(nt.errorMessage || "重写失败,请重新派活");
        }
        return;
      }
      toast.message("脚本仍在重写", { description: "稍后刷新页面查看" });
    } catch {
      toast.error("网络异常,稍后再试");
    } finally {
      setRedrafting(false);
    }
  }

  async function confirmVideo() {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await authFetch(
        `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}/video`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(personaId ? { modelAssetId: personaId } : {}),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error?.message || "提交失败,稍后再试");
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

  // 一句话重写:同市场/商品/人设按指令重生成草稿(留空=直接换一版),不烧视频额度。
  // 成功与否后端都回 DONE(失败回滚原脚本),故按 output 是否变化判定。
  async function rewrite() {
    if (rewriting || redrafting || confirming) return;
    const prevOutput = t.output ?? "";
    setRewriting(true);
    try {
      const res = await authFetch(
        `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}/rewrite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ instruction: rewriteText.trim() }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error?.message || "重写失败,稍后再试");
        return;
      }
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const cur = await authFetch(
          `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}`,
          { credentials: "include" },
        );
        const cj = await cur.json().catch(() => null);
        const nt = cj?.data?.task as StreamTask | undefined;
        if (!nt || ACTIVE_STATUSES.has(nt.status)) continue;
        if (nt.status === "DONE") {
          setLocalTask({ ...task, status: nt.status, output: nt.output, metadata: nt.metadata });
          if ((nt.output ?? "") !== prevOutput) {
            setRewriteText("");
            toast.success("已换一版脚本");
          } else {
            toast.error("重写失败,已保留原脚本");
          }
        } else {
          toast.error(nt.errorMessage || "重写失败,请重新派活");
        }
        return;
      }
      toast.message("脚本仍在重写", { description: "稍后刷新页面查看" });
    } catch {
      toast.error("网络异常,稍后再试");
    } finally {
      setRewriting(false);
    }
  }

  // 重试:置回 QUEUED 立即显示「排队中」,随后本地轮询到终态就地更新(同 rewrite 的轮询口径)。
  async function retryTask() {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await authFetch(
        `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}/retry`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error?.message || "重试失败,稍后再试");
        return;
      }
      setLocalTask({ ...task, status: "QUEUED", output: null, errorMessage: null, metadata: t.metadata });
      for (let i = 0; i < 48; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const cur = await authFetch(
          `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}`,
        );
        const cj = await cur.json().catch(() => null);
        const nt = cj?.data?.task as StreamTask | undefined;
        if (!nt) continue;
        setLocalTask({
          ...task,
          status: nt.status,
          output: nt.output,
          errorMessage: nt.errorMessage,
          metadata: nt.metadata,
        });
        if (!ACTIVE_STATUSES.has(nt.status)) {
          if (nt.status === "DONE") toast.success("重试成功");
          else toast.error(nt.errorMessage || "重试仍失败,请稍后再试");
          return;
        }
      }
    } catch {
      toast.error("网络异常,稍后再试");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div id={`task-${task.id}`} className="space-y-2 scroll-mt-24">
      <UserBubble>{task.input}</UserBubble>
      <AgentBubble agent={t.agent} status={t.status}>
        {active ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t.status === "QUEUED" ? "排队中,马上开始…" : "正在工作,结果会出现在这里…"}
          </div>
        ) : t.status === "FAILED" ? (
          <div className="space-y-2.5">
            <div className="text-sm leading-relaxed text-rose-600">
              {t.errorMessage || "执行失败,请稍后重试"}
            </div>
            {/* TRYON 失败缺图源 ID 无法重建,引导回素材选择器重派,故不给一键重试 */}
            {t.agent !== "TRYON" && (
              <button
                onClick={retryTask}
                disabled={retrying}
                className="press inline-flex items-center gap-1.5 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {retrying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {retrying ? "重试中…" : "重试"}
              </button>
            )}
          </div>
        ) : isListing ? (
          <ListingResults task={t} />
        ) : isTryOn ? (
          <TryOnResult task={t} />
        ) : isVideoAnalysis ? (
          <VideoAnalysisResult data={t.metadata} />
        ) : (
          <>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-900">
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
            {!!t.metadata?.products?.length && <ProductChips products={t.metadata.products} />}
            {awaitingConfirm && (
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-zinc-400">
                    <Globe className="h-3 w-3" /> 目标市场
                  </span>
                  {redrafting ? (
                    <span className="inline-flex items-center gap-1.5 text-2xs text-zinc-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      正在用{pendingLang}重写口播脚本,不消耗积分…
                    </span>
                  ) : (
                    <>
                      <select
                        value={market}
                        onChange={(e) => changeMarket(e.target.value as Region)}
                        disabled={confirming || rewriting}
                        className="h-6 shrink-0 rounded-full border border-[var(--dk-stroke-border)] bg-white pl-2 pr-1 text-2xs font-medium text-zinc-600 outline-none transition-colors hover:border-zinc-300 focus:border-brand-400"
                      >
                        {REGIONS.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.flag} {r.cn} · {r.lang}口播
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0 text-2xs text-zinc-400">
                        口播语言:{voiceLang};换市场将用母语重写脚本
                      </span>
                    </>
                  )}
                </div>
                <PersonaPicker
                  workspaceId={task.workspaceId}
                  value={personaId}
                  onChange={setPersonaId}
                />
                {/* 一句话重写:留空=换一版,填一句=定向重写;不烧视频额度,可反复调 */}
                <div className="flex items-center gap-1.5">
                  <input
                    value={rewriteText}
                    onChange={(e) => setRewriteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rewrite();
                    }}
                    disabled={rewriting || redrafting || confirming}
                    placeholder="不满意?说一句怎么改,留空=直接换一版"
                    className="h-7 min-w-0 flex-1 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 text-2xs text-zinc-600 outline-none transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-brand-400 disabled:opacity-50"
                  />
                  <button
                    onClick={rewrite}
                    disabled={rewriting || redrafting || confirming}
                    className="press inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 py-1.5 text-2xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {rewriting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {rewriting ? "重写中…" : "重写"}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={confirmVideo}
                    disabled={confirming || redrafting || rewriting}
                    className="press inline-flex items-center gap-1.5 rounded-lg bg-[var(--dk-btn-black)] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] hover:bg-[var(--dk-btn-black-hover)] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {confirming ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clapperboard className="h-3.5 w-3.5" />
                    )}
                    {confirming ? "提交中…" : "生成视频"}
                  </button>
                  <CreditCost credits={CREDIT_COST.video} />
                  <span className="text-2xs text-zinc-400">
                    {t.metadata?.durationSec ?? 5}s · {t.metadata?.aspectRatio ?? "9:16"} ·{" "}
                    {voiceLang}口播 · 确认后才开始消耗积分
                  </span>
                </div>
              </div>
            )}
            {isDirector && t.status === "DONE" && videoId && (
              <VideoResultCard workspaceId={task.workspaceId} videoId={videoId} />
            )}
            {review && (
              <button
                onClick={() => setDashOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink"
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

type VideoLite = {
  id: string;
  title?: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  processing: string; // PENDING | GENERATING | COMPLETED | FAILED
  durationSec?: number;
};

/**
 * 对话历史里 DIRECTOR 出片结果的内联成片卡：按 videoId 取一次视频，渲染 9:16 缩略图
 * （生成中 / 失败有徽标），点开进短视频墙。取图失败兜底回文字链接，绝不空着。
 * 不轮询（与「最近成片」同口径：生成中的实时变化去短视频墙看）。
 */
function VideoResultCard({
  workspaceId,
  videoId,
}: {
  workspaceId: string;
  videoId: string;
}) {
  const [video, setVideo] = useState<VideoLite | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let alive = true;
    authFetch(`/api/v1/workspaces/${workspaceId}/videos/${videoId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok && j.data?.video) setVideo(j.data.video as VideoLite);
        else setErrored(true);
      })
      .catch(() => {
        if (alive) setErrored(true);
      });
    return () => {
      alive = false;
    };
  }, [workspaceId, videoId]);

  if (errored) {
    return (
      <Link
        href="/app/videos"
        className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
      >
        <Clapperboard className="h-3 w-3" />
        去短视频墙查看成片 <ArrowRight className="h-3 w-3" />
      </Link>
    );
  }

  const generating =
    !video || video.processing === "PENDING" || video.processing === "GENERATING";
  const failed = video?.processing === "FAILED";

  return (
    <Link
      href="/app/videos"
      title={video?.title || "查看成片"}
      className="dk-card dk-lift group relative mt-3 block aspect-[9/16] w-28 overflow-hidden sm:w-32"
    >
      {video?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-[var(--dk-surface-2)]">
          <Clapperboard className="h-5 w-5 text-zinc-300" />
        </span>
      )}

      {generating ? (
        <span className="absolute inset-x-1.5 top-1.5 inline-flex items-center justify-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          生成中
        </span>
      ) : failed ? (
        <span className="absolute inset-x-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-rose-500/90 px-1.5 py-0.5 text-2xs font-medium text-white">
          生成失败
        </span>
      ) : (
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]">
          <Play className="h-4 w-4 translate-x-px fill-current" />
        </span>
      )}

      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-2xs font-medium text-white">
        查看成片 <ArrowRight className="h-2.5 w-2.5" />
      </span>
    </Link>
  );
}
