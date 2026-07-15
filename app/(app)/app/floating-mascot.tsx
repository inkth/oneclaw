"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CircleAlert,
  Clapperboard,
  Compass,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  PackageSearch,
  Sparkles,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { AGENT_IDENTITY, type AgentKey } from "@/lib/ui/tokens";

/** 派活成功后由各入口 window.dispatchEvent，信标立刻进入运行态（不等下一轮轮询）。 */
export const TASK_DISPATCHED_EVENT = "faxianmao:task-dispatched";

// 同 lib/api-browser 的约定:生产同域留空,本地分端口开发指到 Go 端口。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type ContextAction = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NEW_TASK = "/app/agents/new#agent-composer";

function taskHref(agent: string, prompt: string) {
  return `/app/agents/new?agent=${agent}&prompt=${encodeURIComponent(prompt)}#agent-composer`;
}

function actionFor(pathname: string): ContextAction {
  if (pathname.startsWith("/app/discover/products")) {
    return { label: "开始选品判断", href: taskHref("ANALYST", "请帮我判断当前看到的商品是否值得做，并给出下一步建议。"), icon: PackageSearch };
  }
  if (pathname.startsWith("/app/discover/influencers")) {
    return { label: "评估达人合作", href: taskHref("ADVISOR", "请帮我评估当前达人是否值得合作，并给出合作建议。"), icon: UsersRound };
  }
  if (pathname.startsWith("/app/discover/sellers")) {
    return { label: "分析店铺机会", href: taskHref("ANALYST", "请帮我分析当前店铺的机会、风险和下一步动作。"), icon: Compass };
  }
  if (pathname.startsWith("/app/discover/videos")) {
    return { label: "拆解带货视频", href: taskHref("DIRECTOR", "请帮我拆解当前视频的带货结构，并给出可复用的创作建议。"), icon: Clapperboard };
  }
  if (pathname.startsWith("/app/assets/materials")) {
    return { label: "用素材开始创作", href: taskHref("DIRECTOR", "请基于我的素材，帮我规划一条带货短视频。"), icon: ImagePlus };
  }
  if (pathname.startsWith("/app/assets/products")) {
    return { label: "生成商品内容", href: taskHref("LISTING", "请为我的商品生成 TikTok Shop Listing 内容。"), icon: WandSparkles };
  }
  if (pathname.startsWith("/app/videos")) {
    return { label: "优化视频脚本", href: taskHref("DIRECTOR", "请帮我优化当前视频的脚本与转化表达。"), icon: Clapperboard };
  }
  if (pathname.startsWith("/app/services")) {
    return { label: "规划经营下一步", href: taskHref("ADVISOR", "请根据我的跨境经营目标，建议下一步优先做什么。"), icon: BarChart3 };
  }
  return { label: "发起新任务", href: NEW_TASK, icon: MessageSquarePlus };
}

type LiteTask = {
  id: string;
  conversationId: string;
  agent: string;
  status: string;
  createdAt: string;
};

type Reveal = {
  kind: "done" | "failed";
  label: string;
  conversationId: string;
};

/** 任务完成时的揭晓文案（按 Agent 说人话，而不是笼统的「已完成」）。 */
const DONE_LABEL: Record<string, string> = {
  ADVISOR: "顾问已回复",
  ANALYST: "选品判断完成",
  DIRECTOR: "视频已出片",
  LISTING: "Listing 已生成",
  REVIEW: "复盘报告完成",
  TRYON: "试穿结果出炉",
  VIDEO_ANALYSIS: "视频拆解完成",
};

const ACTIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 45_000;
const REVEAL_TTL_MS = 12_000;

/**
 * 情境助手 + 运行态信标：静止时是当前页最相关的下一步入口（不漂浮、不弹菜单）;
 * 有任务在跑时变成跨页面的任务信标（呼吸光环 + 进行中文案，点击回到会话）,
 * 任务结束时短暂揭晓结果再回落。动效只在「有事发生」时出现，静止时保持静止。
 */
export function FloatingMascot({ workspaceId }: { workspaceId?: string }) {
  const pathname = usePathname();
  const [active, setActive] = useState<LiteTask[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // 上一轮的运行中任务:从 active 列表消失 = 到达终态,再取详情判定 DONE/FAILED。
  const knownRef = useRef<Map<string, LiteTask>>(new Map());
  const seededRef = useRef(false);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showReveal = useCallback((r: Reveal) => {
    setReveal(r);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => setReveal(null), REVEAL_TTL_MS);
  }, []);

  const resolveFinished = useCallback(
    async (t: LiteTask) => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/workspaces/${workspaceId}/agent-tasks/${t.id}`,
          { credentials: "include" },
        );
        const json = await res.json().catch(() => null);
        const task = json?.data?.task as
          | { status: string; agent: string; metadata?: { draft?: boolean; videoId?: string } | null }
          | undefined;
        if (!task) return;
        if (task.status === "DONE") {
          // DIRECTOR 的 DONE 可能只是脚本草稿，还差用户确认这一步——文案要说清楚。
          const awaitingConfirm =
            task.agent === "DIRECTOR" && !!task.metadata?.draft && !task.metadata?.videoId;
          showReveal({
            kind: "done",
            label: awaitingConfirm ? "脚本就绪，待确认出片" : DONE_LABEL[task.agent] ?? "任务已完成",
            conversationId: t.conversationId,
          });
        } else if (task.status === "FAILED") {
          showReveal({ kind: "failed", label: "任务需要你看一眼", conversationId: t.conversationId });
        }
      } catch {
        // 详情取失败就静默放弃这次揭晓，不打扰
      }
    },
    [workspaceId, showReveal],
  );

  const poll = useCallback(async () => {
    if (!workspaceId || stoppedRef.current) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceId}/agent-tasks?active=1`,
        { credentials: "include" },
      );
      // 会话过期时静默停表：后台轮询不该替用户唤起登录弹窗。
      if (res.status === 401) {
        stoppedRef.current = true;
        setActive([]);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      const tasks = (json.data?.tasks ?? []) as LiteTask[];
      // 首轮只建档不揭晓：页面刷新前就完成的任务不该在此刻庆祝。
      if (seededRef.current) {
        let latest: LiteTask | null = null;
        for (const [id, t] of knownRef.current) {
          if (!tasks.some((x) => x.id === id) && (!latest || t.createdAt > latest.createdAt)) {
            latest = t;
          }
        }
        if (latest) void resolveFinished(latest);
      }
      seededRef.current = true;
      knownRef.current = new Map(tasks.map((t) => [t.id, t]));
      setActive(tasks);
    } catch {
      // 网络抖动：跳过本轮，下一轮再试
    }
  }, [workspaceId, resolveFinished]);

  useEffect(() => {
    if (!workspaceId) return;
    let disposed = false;

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const ms = knownRef.current.size > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      timerRef.current = setTimeout(tick, ms);
    };
    const tick = async () => {
      if (disposed) return;
      if (document.visibilityState === "visible") await poll();
      if (!disposed) schedule();
    };
    const onDispatched = () => {
      if (disposed || stoppedRef.current) return;
      void poll().then(() => {
        if (!disposed) schedule();
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onDispatched();
    };

    void poll().then(() => {
      if (!disposed) schedule();
    });
    window.addEventListener(TASK_DISPATCHED_EVENT, onDispatched);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      window.removeEventListener(TASK_DISPATCHED_EVENT, onDispatched);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspaceId, poll]);

  const pillBase =
    "group inline-flex h-11 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4";

  // 揭晓态：任务刚到终态，短暂展示结果入口后自动回落。
  if (reveal) {
    const done = reveal.kind === "done";
    const RevealIcon = done ? Sparkles : CircleAlert;
    return (
      <div className="fixed bottom-[76px] right-3 z-50 md:bottom-5 md:right-6">
        <Link
          href={`/app/agents/${reveal.conversationId}`}
          onClick={() => setReveal(null)}
          className={`${pillBase} ${
            done
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100"
              : "border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-300 hover:bg-rose-100"
          }`}
          aria-label={reveal.label}
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${
              done ? "bg-emerald-500" : "bg-rose-500"
            }`}
          >
            <BrandMark className="h-5 w-5" />
          </span>
          <RevealIcon className={`h-3.5 w-3.5 ${done ? "text-emerald-600" : "text-rose-600"}`} aria-hidden />
          <span className="max-w-40 truncate">{reveal.label}</span>
        </Link>
      </div>
    );
  }

  // 运行态：呼吸光环 + 进行中文案，点击回到最近一条运行中任务的会话。
  if (active.length > 0) {
    const latest = active[0];
    const identity = AGENT_IDENTITY[latest.agent as AgentKey];
    const label =
      active.length === 1 ? `${identity?.label ?? "任务"}进行中…` : `${active.length} 个任务进行中…`;
    return (
      <div className="fixed bottom-[76px] right-3 z-50 md:bottom-5 md:right-6">
        <Link
          href={`/app/agents/${latest.conversationId}`}
          className={`${pillBase} border-brand-200 bg-white text-ink hover:border-brand-300 hover:bg-brand-50`}
          aria-label={label}
        >
          <span className="glow-pulse flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white">
            <BrandMark className="h-5 w-5" />
          </span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" aria-hidden />
          <span className="max-w-40 truncate">{label}</span>
        </Link>
      </div>
    );
  }

  // 静止态：当前页最相关的下一步任务入口（原始行为）。
  const action = actionFor(pathname);
  const Icon = action.icon;
  return (
    <div className="fixed bottom-[76px] right-3 z-50 md:bottom-5 md:right-6">
      <Link
        href={action.href}
        className={`${pillBase} border-black/[0.09] bg-white text-ink hover:border-brand-200 hover:bg-brand-50`}
        aria-label={action.label}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white">
          <BrandMark className="h-5 w-5" />
        </span>
        <Icon className="h-3.5 w-3.5 text-brand-600" aria-hidden />
        <span className="max-w-36 truncate">{action.label}</span>
      </Link>
    </div>
  );
}
