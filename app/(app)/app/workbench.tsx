"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import { authFetch } from "@/lib/api-browser";
import {
  AgentComposer,
  AgentPills,
  type ComposerKind,
  type DirectorMode,
  type ListingMode,
} from "./agent-composer";
import { QuickActionCards, type QuickAction } from "./quick-actions";
import { TaskStream, type StreamTask } from "./task-stream";
import { ReviewTrend } from "./review-trend";
import { industryPresets } from "@/components/OnboardingCard";

const POLL_MS = 5000;

/**
 * 会话流工作台：胶囊行 + 超大输入卡 + 任务消息流 + 快捷功能卡。
 * 派活后新任务气泡立即出现在输入框下方；存在排队/执行中的任务时每 5s 轮询刷新,
 * 结果（含复盘仪表盘）就地展开在流里，不再依赖静态任务列表。
 */
export function Workbench({
  workspaceId,
  conversationId = "",
  isGuest = false,
  showPresets = false,
  initialTasks = [],
  initialAgent,
  initialInput,
  initialProductId,
  initialMaterialId,
  agents,
  streamAgents,
  showQuickActions = false,
  showAssetChips = false,
  showStream = true,
  align = "center",
}: {
  workspaceId: string;
  /** 当前会话 ID:空=新对话（首次派活后路由到真实会话）;非空=在该会话内追加。 */
  conversationId?: string;
  isGuest?: boolean;
  /** 新工作台（无任何数据）时展示品类预设 chips。 */
  showPresets?: boolean;
  /** 服务端预取的任务历史（新→旧），作为会话流初始内容。 */
  initialTasks?: StreamTask[];
  /** 从其他页面接力进来时预选的 Agent 与预填指令（如收藏「为它做视频」）。 */
  initialAgent?: ComposerKind;
  initialInput?: string;
  /** 接力时关联的收藏商品 ID:DIRECTOR/LISTING 派活会带上，后端注入真实商品数据。 */
  initialProductId?: string;
  /** 接力时关联的素材图 ID:素材库「生成 Listing」带上，后端看图写文案 + 作主图参考。 */
  initialMaterialId?: string;
  /** 本页可派活的 Agent 子集（工作台=分析/复盘，创作页=视频/Listing），不传则全量。 */
  agents?: ComposerKind[];
  /** 任务流只展示这些 Agent 的任务（创作页传 DIRECTOR/LISTING），不传则全量。 */
  streamAgents?: ComposerKind[];
  /** 是否展示快捷功能卡（创作类模板，挂在创作页）。 */
  showQuickActions?: boolean;
  /** 是否在输入卡底栏挂资产选择器（商品/人设/素材，创作页开）。 */
  showAssetChips?: boolean;
  /** 胶囊行与预设行的对齐：创作页居中 hero,工作台驾驶舱左对齐。 */
  align?: "center" | "start";
  /** 是否在输入框下方挂对话流（任务消息流）。工作台关掉：派活后只提示去「会话」看进展与结果。 */
  showStream?: boolean;
}) {
  const [activeAgent, setActiveAgent] = useState<ComposerKind>(
    initialAgent ?? agents?.[0] ?? "ADVISOR",
  );
  const [input, setInput] = useState(initialInput ?? "");
  const [productId, setProductId] = useState<string | null>(initialProductId ?? null);
  // 创作工具链选中的资产：与 productId 同生命周期，派活成功即消费清空。
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(initialMaterialId ?? null);
  // Listing 子模式（文案 / 上身图试穿）:切走 Listing 自动回 copy。
  const [listingMode, setListingMode] = useState<ListingMode>("copy");
  // 短视频子模式（做视频 / 视频解析）:切走 DIRECTOR 自动回 create。
  const [directorMode, setDirectorMode] = useState<DirectorMode>("create");
  // 所有 Agent(含同步复盘)统一落任务表，流就是任务列表。
  const [tasks, setTasks] = useState<StreamTask[]>(initialTasks);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // 派活/复盘落库后的统一去处:
  //  · 已在某会话内（showStream && conversationId）:就地追加气泡并自动滚到底;
  //  · 新对话页（showStream 但还没 cid）:后端已自动建会话，路由进那条会话看进展;
  //  · launcher 首页（!showStream）:带你进入新建的会话。
  function ingest(task: StreamTask) {
    if (showStream && conversationId) {
      setTasks((prev) => [task, ...prev]);
    } else {
      const cid = task.conversationId;
      if (!showStream) toast.success("已交给 Agent，可在「对话」查看进度");
      router.push(cid ? `/app/agents/${cid}` : "/app/agents");
    }
  }

  // 轮询拉的是工作区全量任务，本页只看 streamAgents 的（创作页只看视频/Listing）。
  const visibleTasks = streamAgents
    ? tasks.filter((t) => (streamAgents as string[]).includes(t.agent))
    : tasks;

  // 带指令接力进来时（如收藏跳转），光标直接落到输入框，看一眼就能发。
  useEffect(() => {
    if (initialInput) textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从全局「发现猫助手」进入新对话时，落点直接回到派活输入框。
  useEffect(() => {
    function focusFromHash() {
      if (window.location.hash !== "#agent-composer") return;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      });
    }

    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, []);

  // Agent 切换与其子模式在同一个交互中更新，避免额外的 effect 渲染。
  function changeAgent(next: ComposerKind) {
    setActiveAgent(next);
    if (next !== "LISTING") setListingMode("copy");
    if (next !== "DIRECTOR") setDirectorMode("create");
  }

  // 有排队/执行中的任务时轮询当前会话的任务流，全部到达终态自动停。
  const hasActive = tasks.some((t) => t.status === "QUEUED" || t.status === "RUNNING");
  useEffect(() => {
    if (!hasActive || !workspaceId || !showStream || !conversationId) return;
    const timer = setInterval(async () => {
      try {
        const res = await authFetch(
          `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}/tasks`,
        );
        const json = await res.json().catch(() => null);
        const fresh = (json?.data?.tasks ?? json?.tasks) as StreamTask[] | undefined;
        if (res.ok && json?.ok && Array.isArray(fresh)) setTasks(fresh);
      } catch {
        // 网络抖动忽略，下个周期重试
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasActive, workspaceId, showStream, conversationId]);

  // 聊天页：新气泡到达 / 首次加载都把页面滚到底，最新一条紧贴底部输入框（对齐微信、ChatGPT 的方向）。
  const prevCount = useRef(tasks.length);
  useEffect(() => {
    if (!showStream || typeof window === "undefined") return;
    const grew = tasks.length > prevCount.current;
    prevCount.current = tasks.length;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: grew ? "smooth" : "auto",
    });
  }, [tasks.length, showStream]);

  function focusInput(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      // 模板带「」占位时光标落在括号内，否则落到末尾
      const pos = text.indexOf("「」");
      const cursor = pos >= 0 ? pos + 1 : text.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function pickQuickAction(a: QuickAction) {
    if (a.agent) changeAgent(a.agent);
    // Listing 卡带子模式：上身图卡切 tryon,文案卡回 copy(切走后再回也保持一致)。
    if (a.listingMode) setListingMode(a.listingMode);
    if (a.promptTemplate) focusInput(a.promptTemplate);
  }

  function pickPreset(prompt: string) {
    changeAgent("ANALYST");
    focusInput(prompt);
  }

  const allowReview = !agents || agents.includes("REVIEW");

  // 输入卡只定义一处，聊天页与首页 launcher 复用，避免两套 props 漂移。
  const composer = (
    <AgentComposer
      workspaceId={workspaceId}
      conversationId={conversationId}
      isGuest={isGuest}
      activeAgent={activeAgent}
      onAgentChange={changeAgent}
      input={input}
      onInputChange={setInput}
      productId={productId}
      onClearProduct={() => setProductId(null)}
      onProductChange={setProductId}
      personaId={personaId}
      onPersonaChange={setPersonaId}
      materialId={materialId}
      onMaterialChange={setMaterialId}
      listingMode={listingMode}
      // 有快捷卡的页面（首页）靠卡切「文案/上身图」，不渲染底栏开关；会话页没卡，才给开关。
      onListingModeChange={showQuickActions ? undefined : setListingMode}
      directorMode={directorMode}
      // 视频解析无快捷卡,DIRECTOR 在任何页面都用底栏开关切「做视频/视频解析」。
      onDirectorModeChange={setDirectorMode}
      showAssetChips={showAssetChips}
      textareaRef={textareaRef}
      allowReview={allowReview}
      onDispatched={(task) => {
        // 关联资产是一次性的：派活成功即消费，避免下一条任务误带上一次的选择
        if (
          task.agent === "DIRECTOR" ||
          task.agent === "LISTING" ||
          task.agent === "TRYON"
        ) {
          setProductId(null);
          setPersonaId(null);
          setMaterialId(null);
        }
        ingest(task);
      }}
    />
  );

  const pills = (
    <AgentPills active={activeAgent} onChange={changeAgent} kinds={agents} align={align} />
  );

  // 聊天布局（会话页）:会话流在上（正序，旧→新），对话框常驻底部 —— 与微信、ChatGPT 同方向。
  if (showStream) {
    return (
      <>
        <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
          <div className="flex-1 space-y-6">
            {/* 复盘趋势：历次投流复盘的大盘走向，置顶作摘要（≥2 次才渲染）。 */}
            {allowReview && <ReviewTrend tasks={tasks} />}

            {visibleTasks.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
                  <MessagesSquare className="h-6 w-6" />
                </span>
                <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
                  {isGuest
                    ? "选一个 Agent，说说你想解决什么。登录后会自动保存这段对话。"
                    : "还没有内容。选一个 Agent，说说你想解决什么。"}
                </p>
              </div>
            ) : (
              <TaskStream items={visibleTasks} chronological />
            )}
          </div>

          {/* 底部常驻对话框：胶囊在上、超大输入卡在下；磨砂遮罩让会话流从下方滚过。 */}
          <div className="sticky bottom-[68px] z-20 mt-3 bg-background/92 pb-2 pt-3 backdrop-blur-md md:bottom-0">
            {pills}
            <div className="mt-3">{composer}</div>
          </div>
        </div>
      </>
    );
  }

  // Launcher 布局（首页）:居中 hero —— 胶囊 + 超大输入卡 + 快捷卡/品类预设；派活后进入「会话」看结果。
  return (
    <div className="space-y-5 sm:space-y-6">
      {pills}

      <div>{composer}</div>

      {showQuickActions && (
        <QuickActionCards
          activeAgent={activeAgent}
          listingMode={listingMode}
          onPick={pickQuickAction}
        />
      )}

      {showPresets && (
        <div
          className={`flex flex-wrap items-center gap-2 ${
            align === "center" ? "justify-center" : "justify-start"
          }`}
        >
          <span className="text-xs text-zinc-400">还没想好？从一个常见品类开始：</span>
          {industryPresets.map((p) => (
            <button
              key={p.label}
              onClick={() => pickPreset(p.prompt)}
              className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
