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
import { usePageEntity, type PageEntity } from "./page-entity";
import { QuickDispatchSheet } from "./quick-dispatch";
import { AGENT_IDENTITY, type AgentKey } from "@/lib/ui/tokens";

/** 派活成功后由各入口 window.dispatchEvent，信标立刻进入运行态（不等下一轮轮询）。 */
export const TASK_DISPATCHED_EVENT = "faxianmao:task-dispatched";

// 同 lib/api-browser 的约定:生产同域留空,本地分端口开发指到 Go 端口。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type ContextAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** 带 agent+prompt 的动作点击时打开原地派活浮层；缺省（发起新任务）仍走跳转 */
  agent?: AgentKey;
  prompt?: string;
  /** 结构化商品：随浮层派活或 query 预填带给 composer */
  productId?: string;
  /** discover 商品引用：派活时后端注入该商品真实数据做单品判断（ANALYST） */
  discoverRef?: { productId: string; region: string };
};

const NEW_TASK = "/app/agents/new#agent-composer";

function taskHref(agent: string, prompt: string, productId?: string) {
  const qs = new URLSearchParams({ agent, prompt });
  if (productId) qs.set("productId", productId);
  return `/app/agents/new?${qs.toString()}#agent-composer`;
}

/** 可原地派活的情境动作：href 仍保留，作浮层里「展开完整对话」的出口。 */
function dispatchAction(label: string, icon: LucideIcon, agent: AgentKey, prompt: string, productId?: string): ContextAction {
  return { label, icon, agent, prompt, productId, href: taskHref(agent, prompt, productId) };
}

// 实体名进 prompt 前截断，避免超长视频文案把指令挤没
function clip(s: string, max = 24) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function actionFor(pathname: string, entity: PageEntity | null): ContextAction {
  if (pathname.startsWith("/app/discover/products")) {
    if (entity?.kind === "discover-product") {
      // 已导入过的带 productId：切到 DIRECTOR/LISTING 时 composer 能注入真实商品数据
      const action = dispatchAction("判断这个商品", PackageSearch, "ANALYST", `请帮我判断【${clip(entity.name)}】这个商品是否值得做，并给出下一步建议。`, entity.productId);
      // discover 引用：派活时后端据此注入销量/佣金/达人等真实数据，走单品判断而非榜单选品
      action.discoverRef = { productId: entity.id, region: entity.region ?? "US" };
      return action;
    }
    return dispatchAction("开始选品判断", PackageSearch, "ANALYST", "我正在选品，请告诉我判断一个商品值不值得做要看哪些关键指标，我看中后发给你分析。");
  }
  if (pathname.startsWith("/app/discover/influencers")) {
    if (entity?.kind === "discover-influencer") {
      return dispatchAction("评估这位达人", UsersRound, "ADVISOR", `请帮我评估达人「${clip(entity.name)}」是否值得合作，并给出合作建议。`);
    }
    return dispatchAction("评估达人合作", UsersRound, "ADVISOR", "我想找达人带货，请告诉我筛选达人要看哪些指标、怎么开口谈合作。");
  }
  if (pathname.startsWith("/app/discover/sellers")) {
    if (entity?.kind === "discover-seller") {
      return dispatchAction("分析这家店铺", Compass, "ANALYST", `请帮我分析店铺「${clip(entity.name)}」的机会、风险和下一步动作。`);
    }
    return dispatchAction("分析店铺机会", Compass, "ANALYST", "我在研究同行店铺，请告诉我分析一家 TikTok Shop 店铺要看哪些维度。");
  }
  if (pathname.startsWith("/app/discover/videos")) {
    if (entity?.kind === "discover-video") {
      // 视频文案可能为空，退回用 ID 指代
      const ref = entity.name ? `《${clip(entity.name)}》` : `（ID ${entity.id}）`;
      return dispatchAction("拆解这条视频", Clapperboard, "DIRECTOR", `请帮我拆解视频${ref}的带货结构，并给出可复用的创作建议。`);
    }
    return dispatchAction("拆解带货视频", Clapperboard, "DIRECTOR", "我想学爆款带货视频，请告诉我拆解一条视频要看哪些结构和信号。");
  }
  if (pathname.startsWith("/app/products") && entity?.kind === "my-product") {
    return dispatchAction("为它生成内容", WandSparkles, "LISTING", `请为我的商品【${clip(entity.name)}】生成 TikTok Shop Listing 内容。`, entity.productId);
  }
  if (pathname.startsWith("/app/assets/materials")) {
    return dispatchAction("用素材开始创作", ImagePlus, "DIRECTOR", "请基于我的素材，帮我规划一条带货短视频。");
  }
  if (pathname.startsWith("/app/assets/products")) {
    return dispatchAction("生成商品内容", WandSparkles, "LISTING", "请为我的商品生成 TikTok Shop Listing 内容。");
  }
  if (pathname.startsWith("/app/videos")) {
    return dispatchAction("优化视频脚本", Clapperboard, "DIRECTOR", "请帮我优化当前视频的脚本与转化表达。");
  }
  if (pathname.startsWith("/app/services")) {
    return dispatchAction("规划经营下一步", BarChart3, "ADVISOR", "请根据我的跨境经营目标，建议下一步优先做什么。");
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

/** 空态引导：从未派过任务的新用户，静止态固定指向跨境顾问，替代按路由的情境动作。 */
const ONBOARD_ACTION: ContextAction = dispatchAction(
  "不知从哪开始？问问跨境顾问",
  Compass,
  "ADVISOR",
  "我刚开始做 TikTok Shop 跨境电商，请根据我的情况告诉我第一步该做什么。",
);

/** sessionStorage 缓存「是否派过任务」，避免每次导航重复请求。"1"=派过，"0"=从未。 */
function everTaskedKey(workspaceId: string) {
  return `faxianmao:ever-tasked:${workspaceId}`;
}

/**
 * 情境助手 + 运行态信标：静止时是当前页最相关的下一步入口（不漂浮、不弹菜单）;
 * 有任务在跑时变成跨页面的任务信标（呼吸光环 + 进行中文案，点击回到会话）,
 * 任务结束时短暂揭晓结果再回落。动效只在「有事发生」时出现，静止时保持静止。
 */
export function FloatingMascot({ workspaceId }: { workspaceId?: string }) {
  const pathname = usePathname();
  // 详情页经 PageEntityContext 上报当前实体，静止态预填指令指名道姓
  const entity = usePageEntity();
  // 原地派活浮层：记录打开时所在路由，路由一变（含浏览器后退）即自然失效收起
  const [sheetPath, setSheetPath] = useState<string | null>(null);
  const sheetOpen = sheetPath === pathname;
  const [active, setActive] = useState<LiteTask[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // 空态引导：确认「从未派过任务」前保持 false，避免情境动作先闪一下再切换。
  const [neverTasked, setNeverTasked] = useState(false);
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

  // 空态判定：首次挂载查一次全量任务列表；派出首个任务后（TASK_DISPATCHED_EVENT）永久回落。
  useEffect(() => {
    if (!workspaceId) return;
    const key = everTaskedKey(workspaceId);
    let disposed = false;

    const markTasked = () => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        // 隐私模式等场景写不进就算了，本次会话内 state 仍然生效
      }
      setNeverTasked(false);
    };
    window.addEventListener(TASK_DISPATCHED_EVENT, markTasked);

    let cached: string | null = null;
    try {
      cached = sessionStorage.getItem(key);
    } catch {
      // 读不到就当没缓存，走一次请求
    }
    if (cached === "0") {
      setNeverTasked(true);
    } else if (cached !== "1") {
      void (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/agent-tasks`, {
            credentials: "include",
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok) return;
          const empty = ((json.data?.tasks ?? []) as LiteTask[]).length === 0;
          try {
            sessionStorage.setItem(key, empty ? "0" : "1");
          } catch {
            // 同上，缓存失败不影响本次判定
          }
          if (!disposed && empty) setNeverTasked(true);
        } catch {
          // 判定失败保持情境动作模式，不打扰
        }
      })();
    }

    return () => {
      disposed = true;
      window.removeEventListener(TASK_DISPATCHED_EVENT, markTasked);
    };
  }, [workspaceId]);

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

    // 首轮同样走调度器，避免 effect 挂载阶段同步触发状态更新。
    timerRef.current = setTimeout(tick, 0);
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

  // 静止态：从未派过任务的新用户固定引导去问跨境顾问，其余按当前页给情境动作。
  const action = neverTasked ? ONBOARD_ACTION : actionFor(pathname, entity);
  const Icon = action.icon;
  const pillIdle = `${pillBase} border-black/[0.09] bg-white text-ink hover:border-brand-200 hover:bg-brand-50`;
  const pillBody = (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white">
        <BrandMark className="h-5 w-5" />
      </span>
      <Icon className="h-3.5 w-3.5 text-brand-600" aria-hidden />
      <span className={`truncate ${neverTasked ? "max-w-52" : "max-w-36"}`}>{action.label}</span>
    </>
  );

  // 可原地派活的动作：点击展开派活浮层，上下文留在眼前；浮层打开时胶囊让位。
  if (action.agent && action.prompt) {
    if (sheetOpen) {
      return (
        <QuickDispatchSheet
          workspaceId={workspaceId ?? ""}
          agent={action.agent}
          initialPrompt={action.prompt}
          productId={action.productId}
          fullHref={action.href}
          entityName={entity?.name || undefined}
          discoverRef={action.discoverRef}
          onClose={() => setSheetPath(null)}
        />
      );
    }
    return (
      <div className="fixed bottom-[76px] right-3 z-50 md:bottom-5 md:right-6">
        <button type="button" onClick={() => setSheetPath(pathname)} className={pillIdle} aria-label={action.label}>
          {pillBody}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-[76px] right-3 z-50 md:bottom-5 md:right-6">
      <Link href={action.href} className={pillIdle} aria-label={action.label}>
        {pillBody}
      </Link>
    </div>
  );
}
