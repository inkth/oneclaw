"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  FileSpreadsheet,
  LayoutList,
  Loader2,
  Package,
  Plus,
  Send,
  Shirt,
  Sparkles,
  X,
} from "lucide-react";
import { type ReviewResult } from "@/lib/review/types";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { CreditCost } from "@/components/ui/CreditCost";
import { CREDIT_COST } from "@/lib/credits";
import { type StreamTask } from "./task-stream";
import { AssetChips, DEFAULT_VIDEO_SETTINGS, type VideoSettings } from "./create/asset-chips";
import { AssetPickerModal } from "./create/asset-picker-modal";

// 走后端 agent-tasks 的异步 Agent;REVIEW 是前端同步复盘模式(上传报表 → 就地仪表盘)。
// TRYON 不再是独立胶囊:并入 LISTING 作「上身图」子模式(派活时仍落 TRYON 任务),故不在 PILL_AGENTS。
export type ComposerKind = "ANALYST" | "DIRECTOR" | "LISTING" | "TRYON" | "REVIEW";

/** Listing 内容的两个子模式:文案(标题/卖点/A+/主图)与上身图(虚拟试穿)。 */
export type ListingMode = "copy" | "tryon";

/** 胶囊行展示的 Agent(4 个;虚拟试穿并入 Listing 子模式)。 */
const PILL_AGENTS = (["ANALYST", "DIRECTOR", "LISTING", "REVIEW"] as const).map(
  (kind) => ({ kind: kind as ComposerKind, ...AGENT_IDENTITY[kind] }),
);

const PLACEHOLDERS: Record<ComposerKind, string> = {
  ANALYST: "例:从美国热销榜帮我挑 3 个高佣金潜力品(基于 EchoTik 真实榜单筛选)",
  DIRECTOR: "例:为推荐榜首产品生成一条 UGC 风格 TikTok 带货短视频,真人开箱口播感",
  LISTING: "例:为「便携榨汁杯」生成 TikTok Shop Listing:标题、五点卖点、A+ 结构、主图方案",
  TRYON: "选一位模特 + 一张服饰图,生成模特上身效果图",
  REVIEW: "点左下角「上传报表」上传 GMVMax 投放报表(.csv / .xlsx),即可开始复盘",
};

const REVIEW_EXTENSIONS = /\.(csv|tsv|xlsx)$/i;

// 复盘走 Go 后端 workspace 端点(multipart 上传),与 agent-tasks 的 JSON 流程并行。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** 胶囊行:图标 + 名称,激活态彩虹发丝环。独立于输入卡,由 Workbench 居中排布。 */
export function AgentPills({
  active,
  onChange,
  kinds,
  align = "center",
}: {
  active: ComposerKind;
  onChange: (k: ComposerKind) => void;
  /** 本页可派活的 Agent 子集(如创作页只挂 DIRECTOR/LISTING),不传则全量。 */
  kinds?: ComposerKind[];
  /** 居中(创作页 hero 布局)或左对齐(工作台驾驶舱)。 */
  align?: "center" | "start";
}) {
  const pills = kinds ? PILL_AGENTS.filter((a) => kinds.includes(a.kind)) : PILL_AGENTS;
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${
        align === "center" ? "justify-center" : "justify-start"
      }`}
    >
      {pills.map((a) => {
        const isActive = a.kind === active;
        return (
          <button
            key={a.kind}
            onClick={() => onChange(a.kind)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "dk-ring text-ink"
                : "border border-black/10 bg-white text-zinc-600 hover:border-black/20 hover:text-ink"
            }`}
          >
            <a.icon className={`h-4 w-4 ${isActive ? "" : "text-zinc-400"}`} />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 工作台核心:对标竞品的超大输入卡。
 * 一个输入框统一所有流程——异步 Agent 派活、上传报表触发同步复盘;
 * 左下「+ 添加」收附件,右下黑色发送。
 * 派活成功 / 复盘完成都通过回调交给上层会话流(TaskStream)渲染。
 */
export function AgentComposer({
  workspaceId,
  isGuest = false,
  activeAgent,
  onAgentChange,
  input,
  onInputChange,
  productId,
  onClearProduct,
  onProductChange,
  personaId,
  onPersonaChange,
  materialId,
  onMaterialChange,
  listingMode = "copy",
  onListingModeChange,
  showAssetChips = false,
  textareaRef,
  onDispatched,
  allowReview = true,
}: {
  workspaceId: string;
  isGuest?: boolean;
  activeAgent: ComposerKind;
  onAgentChange: (k: ComposerKind) => void;
  input: string;
  onInputChange: (v: string) => void;
  /** 收藏接力带入的商品 ID:DIRECTOR/LISTING 派活时一并提交,后端注入真实商品数据并关联产出。 */
  productId?: string | null;
  onClearProduct?: () => void;
  /** 创作页工具链:商品/人设/素材选择(状态由 Workbench 持有,派活即清空)。 */
  onProductChange?: (id: string | null) => void;
  personaId?: string | null;
  onPersonaChange?: (id: string | null) => void;
  materialId?: string | null;
  onMaterialChange?: (id: string | null) => void;
  /** Listing 子模式:文案 / 上身图(试穿);由 Workbench 持有,切走 Listing 自动回 copy。 */
  listingMode?: ListingMode;
  onListingModeChange?: (m: ListingMode) => void;
  /** 是否在底栏展示资产选择器(创作页开)。 */
  showAssetChips?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** 任务创建成功(异步派活或同步复盘落库),新任务立即插入会话流。 */
  onDispatched?: (task: StreamTask) => void;
  /** 本页是否提供「上传报表复盘」入口(创作页没有 REVIEW,关掉附件按钮与拖拽)。 */
  allowReview?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  // 虚拟试穿内联选择器(选模特 + 服饰图)开关;复用 DIRECTOR/LISTING 的资产选择弹窗。
  const [tryOnPickerOpen, setTryOnPickerOpen] = useState(false);

  // 出片设置(目标市场/时长/比例):仅短视频用,作为「偏好」跨条沿用(不随派活清空),
  // 选项面板挂在 AssetChips 的「设置」chip 里。
  const [videoSettings, setVideoSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);

  // 复盘附件状态:选中报表后自动切到 REVIEW,移除则回到之前的 Agent。
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [targetRoi, setTargetRoi] = useState("3.0");
  const prevAgentRef = useRef<ComposerKind>("ANALYST");
  const fileRef = useRef<HTMLInputElement>(null);
  const { open: openAuthModal } = useAuthModal();

  const isReview = activeAgent === "REVIEW";
  // 虚拟试穿 = Listing 的「上身图」子模式:输入是「模特 + 服饰图」两张图而非文字,凑齐才可发。
  const isTryOn = activeAgent === "LISTING" && listingMode === "tryon";
  const tryOnReady = !!personaId && (!!materialId || !!productId);
  const placeholder =
    isReview && attachedFile
      ? "可补充说明(选填),例:重点看 ROI 低于 2 的素材该停还是改"
      : PLACEHOLDERS[activeAgent];
  const canSend = attachedFile ? true : isTryOn ? tryOnReady : !isReview && !!input.trim();

  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可使用 Agent",
      desc: "派活给选品分析、短视频创作、Listing、虚拟试穿、投放复盘 Agent 需要账号。",
    });
    return true;
  }

  function attach(f: File) {
    if (!allowReview) return;
    if (!REVIEW_EXTENSIONS.test(f.name)) {
      toast("暂仅支持投放报表(.csv / .tsv / .xlsx),图片素材即将支持");
      return;
    }
    if (!isReview) prevAgentRef.current = activeAgent;
    setAttachedFile(f);
    onAgentChange("REVIEW");
  }

  function removeAttachment() {
    setAttachedFile(null);
    onAgentChange(prevAgentRef.current === "REVIEW" ? "ANALYST" : prevAgentRef.current);
  }

  async function submitTask() {
    setSubmitting(true);
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/agent-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // 试穿子模式派活落 TRYON 任务(后端不变),其余按当前 Agent
        agent: isTryOn ? "TRYON" : activeAgent,
        // 试穿无文字指令(输入是两张图),给个默认 input 满足后端非空校验,也作会话气泡标题
        input: isTryOn ? input.trim() || "虚拟试穿" : input.trim(),
        // 创作类 + 试穿携带:DIRECTOR/LISTING 注入收藏真实数据;TRYON 用商品主图当服饰图
        ...((activeAgent === "DIRECTOR" || activeAgent === "LISTING" || isTryOn) && productId
          ? { productId }
          : {}),
        // 人设/模特:DIRECTOR 出镜口播,TRYON 作试穿模特
        ...((activeAgent === "DIRECTOR" || isTryOn) && personaId ? { modelAssetId: personaId } : {}),
        // 参考素材:DIRECTOR 首帧 / LISTING 出图参考 / TRYON 服饰图(优先于商品主图)
        ...((activeAgent === "DIRECTOR" || activeAgent === "LISTING" || isTryOn) && materialId
          ? { materialId }
          : {}),
        // 出片设置(仅短视频):市场/比例总是显式带上;时长「自动」(null)时不发,交给 AI 配速
        ...(activeAgent === "DIRECTOR"
          ? {
              region: videoSettings.region,
              ...(videoSettings.duration ? { durationSec: videoSettings.duration } : {}),
              aspectRatio: videoSettings.aspect,
            }
          : {}),
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || json?.message || "发送失败");
      return;
    }
    onInputChange("");
    // 新任务气泡立即出现在输入框下方,无需跳转提示
    const task = (json.data?.task ?? json.task) as StreamTask | undefined;
    if (task) onDispatched?.(task);
  }

  async function analyze() {
    if (!workspaceId) {
      openAuthModal({
        title: "登录后即可上传报表",
        desc: "投放复盘需要账号，登录后报表分析结果会保存在工作台。",
      });
      return;
    }
    if (!attachedFile) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", attachedFile);
      fd.append("targetRoi", targetRoi);
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceId}/review/analyze`,
        { method: "POST", body: fd, credentials: "include" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || "分析失败,请检查报表格式");
        return;
      }
      // 复盘已在后端落库为 REVIEW 任务,和异步派活走同一条流
      const r = json.data.result as ReviewResult;
      const task = json.data.task as StreamTask | null;
      if (task) onDispatched?.(task);
      setAttachedFile(null);
      onInputChange("");
      if (r.warnings?.length) toast.message(r.warnings[0]);
    } catch {
      toast.error("网络异常,稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (submitting) return;
    if (gateGuest()) return;
    if (attachedFile) {
      await analyze();
      return;
    }
    if (isReview) {
      toast("先点左下角「上传报表」上传投放报表");
      return;
    }
    if (isTryOn) {
      if (!tryOnReady) {
        toast("请先选择模特和服饰图");
        return;
      }
      await submitTask();
      return;
    }
    if (!input.trim()) return;
    await submitTask();
  }

  return (
    <>
    <div
      className="dk-card overflow-hidden transition-shadow focus-within:border-black/15"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) attach(f);
        }}
      >
        {/* Listing 子模式切换:文案 / 上身图(试穿)。仅 Listing 显示,折叠原虚拟试穿胶囊。 */}
        {activeAgent === "LISTING" && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            <div className="inline-flex rounded-full border border-black/10 bg-zinc-50 p-0.5">
              <SubModeButton active={!isTryOn} icon={LayoutList} onClick={() => onListingModeChange?.("copy")}>
                文案
              </SubModeButton>
              <SubModeButton active={isTryOn} icon={Shirt} onClick={() => onListingModeChange?.("tryon")}>
                上身图
              </SubModeButton>
            </div>
            <span className="text-2xs text-zinc-400">
              {isTryOn
                ? "真人上身效果图 · 自动存入素材库，做视频可复用"
                : "标题 / 卖点 / A+ / 主图方案"}
            </span>
          </div>
        )}

        {/* 关联商品 chip:收藏接力带入(创作页有 AssetChips 时由选择器展示,不重复出 chip) */}
        {!showAssetChips && !isTryOn && (activeAgent === "DIRECTOR" || activeAgent === "LISTING") && productId && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2 pr-1 text-xs font-medium text-brand-700">
              <Package className="h-3.5 w-3.5" />
              已关联选品商品 · 将注入其真实数据
              <button
                onClick={onClearProduct}
                className="rounded-full p-0.5 text-brand-400 hover:bg-brand-100 hover:text-brand-700"
                aria-label="取消关联商品"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        {/* 附件 chip:报表文件 + 内联 ROI 目标 */}
        {attachedFile && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 py-1 pl-2 pr-1 text-xs font-medium text-zinc-700">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span className="max-w-48 truncate">{attachedFile.name}</span>
              <button
                onClick={removeAttachment}
                className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                aria-label="移除附件"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
            <label className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              ROI 目标
              <input
                type="number"
                step="0.1"
                min="0"
                value={targetRoi}
                onChange={(e) => setTargetRoi(e.target.value)}
                className="h-7 w-16 rounded-lg border border-zinc-200 px-2 text-xs tabular-nums focus:border-brand-400 focus:outline-none"
              />
              <span className="hidden sm:inline text-2xs text-zinc-400">象限以此为高/低 ROI 分界</span>
            </label>
          </div>
        )}

        {isTryOn ? (
          // 与非试穿的 textarea(rows=4)等高,切换 Agent 时输入卡不跳变
          <div className="flex min-h-[118px] items-center px-4 py-3.5">
            <p className="text-sm leading-relaxed text-zinc-500">
              选一位模特 + 一张服饰图(上传图,或选品库里带主图的商品),AI 生成模特上身效果图。
            </p>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            rows={4}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
          />
        )}

        {/* 底栏:左「+ 添加」附件(仅含复盘的页面),右黑色发送 */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {isReview && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.xlsx,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) attach(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink"
                title="上传 GMVMax 投放报表触发复盘"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                上传报表
              </button>
            </>
          )}

          {/* 虚拟试穿:选模特 + 服饰图,与复盘「上传报表」同处底栏左下角 */}
          {isTryOn && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (gateGuest()) return;
                  setTryOnPickerOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" />
                选择模特与服饰
              </button>
              <AssetStatus ok={!!personaId} label="模特" />
              <AssetStatus ok={!!materialId || !!productId} label="服饰图" />
            </>
          )}

          {/* 创作工具链:商品 / 出镜人设 / 首帧素材(试穿子模式用专属「选择模特与服饰」,不重复出) */}
          {showAssetChips && !isTryOn && (
            <AssetChips
              workspaceId={workspaceId}
              activeAgent={activeAgent}
              productId={productId ?? null}
              onProductChange={(id) => onProductChange?.(id)}
              personaId={personaId ?? null}
              onPersonaChange={(id) => onPersonaChange?.(id)}
              materialId={materialId ?? null}
              onMaterialChange={(id) => onMaterialChange?.(id)}
              videoSettings={videoSettings}
              onVideoSettingsChange={setVideoSettings}
              gate={gateGuest}
            />
          )}

          <div className="ml-auto flex items-center gap-2">
            {!isReview && !attachedFile && !isTryOn && (
              <CreditCost credits={CREDIT_COST.agentTask} />
            )}
            {isTryOn && !attachedFile && <CreditCost credits={CREDIT_COST.image} />}
            {!isTryOn && (
              <span className="hidden sm:inline text-2xs text-zinc-400">⌘/Ctrl + Enter 发送</span>
            )}
            <button
              onClick={submit}
              disabled={submitting || !canSend}
              className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : attachedFile ? (
                <Sparkles className="h-4 w-4" />
              ) : isTryOn ? (
                <Shirt className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting
                ? attachedFile
                  ? "分析中…"
                  : isTryOn
                    ? "生成中…"
                    : "发送中…"
                : attachedFile
                  ? "开始复盘"
                  : isTryOn
                    ? "生成上身图"
                    : "发送"}
            </button>
          </div>
        </div>
    </div>
    {tryOnPickerOpen && (
      <AssetPickerModal
        workspaceId={workspaceId}
        activeAgent={activeAgent}
        tryOn={isTryOn}
        productId={productId ?? null}
        onProductChange={(id) => onProductChange?.(id)}
        personaId={personaId ?? null}
        onPersonaChange={(id) => onPersonaChange?.(id)}
        materialId={materialId ?? null}
        onMaterialChange={(id) => onMaterialChange?.(id)}
        onClose={() => setTryOnPickerOpen(false)}
      />
    )}
    </>
  );
}

/** Listing 子模式分段按钮:选中白底浮起,未选灰字。 */
function SubModeButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof Shirt;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-white text-ink shadow-sm" : "text-zinc-500 hover:text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/** 虚拟试穿内联选择状态小药丸:已选 brand 勾,未选灰点。 */
function AssetStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium ${
        ok
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-black/10 bg-white text-zinc-400"
      }`}
    >
      {ok ? (
        <Check className="h-3 w-3" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
      )}
      {label}
    </span>
  );
}
