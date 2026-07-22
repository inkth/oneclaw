"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronUp,
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
  /** 情境问题：浮层里按当前实体给几条现成问法，点选填入输入框 */
  suggestions?: string[];
};

/** 派活浮层固定展示 2×2 快捷问法；tuple 让新增场景漏配时在类型检查阶段直接报错。 */
type QuickSuggestions = [string, string, string, string];

const NEW_TASK = "/app/agents/new#agent-composer";

function taskHref(agent: string, prompt: string, productId?: string) {
  const qs = new URLSearchParams({ agent, prompt });
  if (productId) qs.set("productId", productId);
  return `/app/agents/new?${qs.toString()}#agent-composer`;
}

/** 可原地派活的情境动作：href 仍保留，作浮层里「展开完整对话」的出口。 */
function dispatchAction(
  label: string,
  icon: LucideIcon,
  agent: AgentKey,
  prompt: string,
  opts: { productId?: string; suggestions: QuickSuggestions },
): ContextAction {
  return {
    label,
    icon,
    agent,
    prompt,
    productId: opts.productId,
    suggestions: opts.suggestions,
    href: taskHref(agent, prompt, opts.productId),
  };
}

// 实体名进 prompt 前截断，避免超长视频文案把指令挤没
function clip(s: string, max = 24) {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function actionFor(pathname: string, entity: PageEntity | null): ContextAction {
  if (pathname.startsWith("/app/discover/products")) {
    if (entity?.kind === "discover-product") {
      const n = `【${clip(entity.name)}】`;
      // 已导入过的带 productId：切到 DIRECTOR/LISTING 时 composer 能注入真实商品数据
      const action = dispatchAction("判断这个商品", PackageSearch, "ANALYST", `请帮我判断${n}这个商品是否值得做，并给出下一步建议。`, {
        productId: entity.productId,
        // 这些问法都会命中后端注入的真实销量/佣金/达人数据（单品判断模式）
        suggestions: [
          `${n}的销量主要靠谁带？达人、视频还是自然流量？`,
          `${n}还有利润空间吗？按售价和佣金帮我算笔账。`,
          `${n}是稳定爆品还是短期冲量？现在跟进还来得及吗？`,
          `${n}的竞争激烈吗？同类卖家和主流价格带是什么情况？`,
        ],
      });
      // discover 引用：派活时后端据此注入销量/佣金/达人等真实数据，走单品判断而非榜单选品
      action.discoverRef = { productId: entity.id, region: entity.region ?? "US" };
      return action;
    }
    return dispatchAction("开始选品判断", PackageSearch, "ANALYST", "我正在选品，请告诉我判断一个商品值不值得做要看哪些关键指标，我看中后发给你分析。", {
      suggestions: [
        "现在美区哪些类目对新手比较友好？",
        "帮我定一套自己的选品标准，我做低客单价商品。",
        "怎么看一个商品是稳定增长，还是短期冲量？",
        "低客单价商品的售价、毛利和达人佣金怎么定？",
      ],
    });
  }
  if (pathname.startsWith("/app/discover/influencers")) {
    if (entity?.kind === "discover-influencer") {
      const n = `「${clip(entity.name)}」`;
      return dispatchAction("评估这位达人", UsersRound, "ADVISOR", `请帮我评估达人${n}是否值得合作，并给出合作建议。`, {
        suggestions: [
          `和达人${n}谈合作怎么开口？佣金给多少合适？`,
          `达人${n}的内容风格适合带什么类型的商品？`,
          `第一次找达人${n}这种量级的合作，要注意什么坑？`,
          `达人${n}最近的带货表现稳定吗？有没有数据波动风险？`,
        ],
      });
    }
    return dispatchAction("评估达人合作", UsersRound, "ADVISOR", "我想找达人带货，请告诉我筛选达人要看哪些指标、怎么开口谈合作。", {
      suggestions: [
        "新店没销量，达人为什么要理我？怎么破冷启动？",
        "达人建联的话术模板给我一份。",
        "怎么判断达人是真实带货，还是数据虚高？",
        "新店应该优先找什么量级、什么类型的达人？",
      ],
    });
  }
  if (pathname.startsWith("/app/discover/sellers")) {
    if (entity?.kind === "discover-seller") {
      const n = `「${clip(entity.name)}」`;
      return dispatchAction("分析这家店铺", Compass, "ANALYST", `请帮我分析店铺${n}的机会、风险和下一步动作。`, {
        suggestions: [
          `店铺${n}的选品和打法有什么可复制的？`,
          `如果和店铺${n}做同类目，我该怎么差异化？`,
          `店铺${n}这种体量大概什么运营配置？我能跟吗？`,
          `店铺${n}的增长主要靠哪些商品和流量渠道？`,
        ],
      });
    }
    return dispatchAction("分析店铺机会", Compass, "ANALYST", "我在研究同行店铺，请告诉我分析一家 TikTok Shop 店铺要看哪些维度。", {
      suggestions: [
        "怎么从店铺榜找到适合我模仿的对标店？",
        "美区店铺现在什么打法起量最快？",
        "分析一家对标店，最应该先看哪几个数据？",
        "怎么判断一家店是稳定经营，还是短期冲量？",
      ],
    });
  }
  if (pathname.startsWith("/app/discover/videos")) {
    if (entity?.kind === "discover-video") {
      // 视频文案可能为空，退回用 ID 指代
      const ref = entity.name ? `《${clip(entity.name)}》` : `（ID ${entity.id}）`;
      return dispatchAction("拆解这条视频", Clapperboard, "DIRECTOR", `请帮我拆解视频${ref}的带货结构，并给出可复用的创作建议。`, {
        suggestions: [
          `照视频${ref}的结构，帮我写一个仿拍脚本大纲。`,
          `视频${ref}的开头是怎么留住人的？我怎么套用？`,
          `视频${ref}这种拍法，不出镜能做吗？`,
          `视频${ref}的转化点在哪里？商品卖点是怎么植入的？`,
        ],
      });
    }
    return dispatchAction("拆解带货视频", Clapperboard, "DIRECTOR", "我想学爆款带货视频，请告诉我拆解一条视频要看哪些结构和信号。", {
      suggestions: [
        "爆款带货视频的通用结构是什么？",
        "不出镜、不真人口播，能做哪些类型的带货视频？",
        "怎么判断一条热视频是真的能带货，还是只有播放量？",
        "新手最适合先模仿哪种低成本带货视频？",
      ],
    });
  }
  if (pathname.startsWith("/app/products") && entity?.kind === "my-product") {
    return dispatchAction("为它生成内容", WandSparkles, "LISTING", `请为我的商品【${clip(entity.name)}】生成 TikTok Shop Listing 内容。`, {
      productId: entity.productId,
      suggestions: [
        `帮我提炼【${clip(entity.name)}】最值得强调的 5 个卖点。`,
        `为【${clip(entity.name)}】写一版高转化的英文标题和详情。`,
        `【${clip(entity.name)}】适合卖给谁？帮我梳理人群和使用场景。`,
        `为【${clip(entity.name)}】规划主图顺序和每张图的文案。`,
      ],
    });
  }
  if (pathname.startsWith("/app/assets/materials")) {
    return dispatchAction("用素材开始创作", ImagePlus, "DIRECTOR", "请基于我的素材，帮我规划一条带货短视频。", {
      suggestions: [
        "用现有素材帮我规划一条 10 秒带货视频。",
        "检查我的素材还缺哪些镜头，列一份补拍清单。",
        "把现有素材改成 UGC 风格，帮我写脚本和剪辑节奏。",
        "基于同一组素材，给我 4 个不同开头的测试方案。",
      ],
    });
  }
  if (pathname.startsWith("/app/assets/products")) {
    return dispatchAction("生成商品内容", WandSparkles, "LISTING", "请为我的商品生成 TikTok Shop Listing 内容。", {
      suggestions: [
        "帮我写一套 TikTok Shop 商品标题和五点卖点。",
        "从用户痛点出发，帮我提炼商品的核心卖点。",
        "帮我定位目标人群、使用场景和内容角度。",
        "规划一套主图和详情页的图文结构。",
      ],
    });
  }
  if (pathname.startsWith("/app/videos")) {
    return dispatchAction("优化视频脚本", Clapperboard, "DIRECTOR", "请帮我优化当前视频的脚本与转化表达。", {
      suggestions: [
        "帮我把前 3 秒改得更抓人，给 4 个开头方案。",
        "检查脚本节奏，删掉拖沓内容并强化卖点。",
        "这条视频的转化表达哪里弱？帮我重写 CTA。",
        "基于当前脚本，再给我 3 个不同角度的测试版本。",
      ],
    });
  }
  if (pathname.startsWith("/app/services")) {
    return dispatchAction("规划经营下一步", BarChart3, "ADVISOR", "请根据我的跨境经营目标，建议下一步优先做什么。", {
      suggestions: [
        "我是新手，帮我规划从开店到第一单的路线。",
        "美区本土店和全托管有什么区别？我适合哪种？",
        "开店前期要准备多少预算？大头花在哪？",
        "根据我的资源和经验，下一步最该优先做什么？",
      ],
    });
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
  {
    suggestions: [
      "开一家美区小店需要什么条件和预算？",
      "没货源、没粉丝，我该从哪一步开始？",
      "我适合先做选品、内容，还是先找达人合作？",
      "帮我做一份从零开始的 30 天行动计划。",
    ],
  },
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
      queueMicrotask(() => {
        if (!disposed) setNeverTasked(true);
      });
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

  // 只在选品/服务板块出场：工作台、对话、资产各有自己的主流程，浮猫不去抢注意力。
  // 放在所有 hooks 之后早退，轮询照常在后台保温——切回可见板块时信标状态即时正确。
  if (!pathname.startsWith("/app/discover") && !pathname.startsWith("/app/services")) {
    return null;
  }

  const pillBase =
    "group inline-flex h-11 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4";
  // 底部居中停靠条：inset-x-0 铺满仅为定位居中，pointer-events 只留给内容本身
  const dock =
    "pointer-events-none fixed inset-x-0 bottom-[76px] z-50 flex justify-center px-3 md:bottom-6";

  // 揭晓态：任务刚到终态，短暂展示结果入口后自动回落。
  if (reveal) {
    const done = reveal.kind === "done";
    const RevealIcon = done ? Sparkles : CircleAlert;
    return (
      <div className={dock}>
        <Link
          href={`/app/agents/${reveal.conversationId}`}
          onClick={() => setReveal(null)}
          className={`pointer-events-auto ${pillBase} ${
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
      <div className={dock}>
        <Link
          href={`/app/agents/${latest.conversationId}`}
          className={`pointer-events-auto ${pillBase} border-brand-200 bg-white text-ink hover:border-brand-300 hover:bg-brand-50`}
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
  // 折叠条：双行（身份 + 情境引导），点击展开成派活浮层
  const barIdle =
    "pointer-events-auto group flex items-center gap-3 rounded-full border border-black/[0.09] bg-white py-1.5 pl-1.5 pr-4 text-left shadow-[0_16px_40px_-20px_rgba(18,20,25,0.4)] transition-colors hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4";
  const barBody = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
        <BrandMark className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold leading-5 text-ink">发现猫 Agent</span>
        <span className="flex items-center gap-1 text-2xs leading-4 text-[var(--dk-content-secondary)]">
          <Icon className="h-3 w-3 shrink-0 text-brand-600" aria-hidden />
          <span className="max-w-56 truncate">{action.label}</span>
        </span>
      </span>
    </>
  );

  // 可原地派活的动作：点击展开派活浮层，上下文留在眼前；浮层打开时折叠条让位。
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
          suggestions={action.suggestions}
          onClose={() => setSheetPath(null)}
        />
      );
    }
    return (
      <div className={dock}>
        <button type="button" onClick={() => setSheetPath(pathname)} className={barIdle} aria-label={`展开：${action.label}`}>
          {barBody}
          <ChevronUp
            className="h-4 w-4 shrink-0 text-[var(--dk-content-tertiary)] transition-transform group-hover:-translate-y-0.5"
            aria-hidden
          />
        </button>
      </div>
    );
  }

  return (
    <div className={dock}>
      <Link href={action.href} className={barIdle} aria-label={action.label}>
        {barBody}
      </Link>
    </div>
  );
}
