"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Clapperboard,
  FileSpreadsheet,
  FileVideo,
  LayoutList,
  Loader2,
  Package,
  Plus,
  ScanText,
  Send,
  Shirt,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { type ReviewResult } from "@/lib/review/types";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { CreditCost } from "@/components/ui/CreditCost";
import { CREDIT_COST } from "@/lib/credits";
import { type StreamTask } from "./task-stream";
import { TASK_DISPATCHED_EVENT } from "./floating-mascot";
import { AssetChips, DEFAULT_VIDEO_SETTINGS, type VideoSettings } from "./create/asset-chips";
import { AssetPickerModal } from "./create/asset-picker-modal";

// 走后端 agent-tasks 的异步 Agent;REVIEW 是前端同步复盘模式（上传报表 → 就地仪表盘）。
// TRYON 不再是独立胶囊：并入 LISTING 作「上身图」子模式（派活时仍落 TRYON 任务），故不在 PILL_AGENTS。
// ADVISOR 是对话式跨境顾问（答疑/排路线），与其他 Agent 同流程（照常计积分），排在产出型胶囊之前。
export type ComposerKind = "ADVISOR" | "ANALYST" | "DIRECTOR" | "LISTING" | "TRYON" | "REVIEW";

/** Listing 内容的两个子模式：文案（标题/卖点/A+/主图）与上身图（虚拟试穿）。 */
export type ListingMode = "copy" | "tryon";

/** 短视频创作的两个子模式：做视频（写脚本→出片）与视频解析（拆解一条参考带货视频）。 */
export type DirectorMode = "create" | "analyze";

/** 胶囊行展示的 Agent(5 个；虚拟试穿并入 Listing 子模式)。顾问打头：新手先问路，再派活。 */
const PILL_AGENTS = (["ADVISOR", "ANALYST", "DIRECTOR", "LISTING", "REVIEW"] as const).map(
  (kind) => ({ kind: kind as ComposerKind, ...AGENT_IDENTITY[kind] }),
);

const PLACEHOLDERS: Record<ComposerKind, string> = {
  ADVISOR: "例：预算 5000 元，没有货源，想做美国市场，我该从哪一步开始？",
  ANALYST: "例：从美国爆品榜挑 3 个高佣金、仍在增长的潜力商品",
  DIRECTOR: "例：为榜首商品做一条 UGC 开箱带货视频，突出使用前后对比",
  LISTING: "例：为便携榨汁杯生成标题、五点卖点、图文详情和主图方案",
  TRYON: "选一位模特 + 一张服饰图，生成模特上身效果图",
  REVIEW: "点左下角「上传报表」上传 GMV Max 投放报表（.csv / .xlsx），即可开始复盘",
};

const REVIEW_EXTENSIONS = /\.(csv|tsv|xlsx)$/i;

// 复盘走 Go 后端 workspace 端点（multipart 上传），与 agent-tasks 的 JSON 流程并行。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** 胶囊行：图标 + 名称，激活态彩虹发丝环。独立于输入卡，由 Workbench 居中排布。 */
export function AgentPills({
  active,
  onChange,
  kinds,
  align = "center",
}: {
  active: ComposerKind;
  onChange: (k: ComposerKind) => void;
  /** 本页可派活的 Agent 子集（如创作页只挂 DIRECTOR/LISTING），不传则全量。 */
  kinds?: ComposerKind[];
  /** 居中（创作页 hero 布局）或左对齐（工作台驾驶舱）。 */
  align?: "center" | "start";
}) {
  const pills = kinds ? PILL_AGENTS.filter((a) => kinds.includes(a.kind)) : PILL_AGENTS;
  return (
    <div
      className={`flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible ${
        align === "center" ? "justify-start sm:justify-center" : "justify-start"
      }`}
    >
      {pills.map((a) => {
        const isActive = a.kind === active;
        return (
          <button
            key={a.kind}
            onClick={() => onChange(a.kind)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 ${
              isActive
                ? "dk-ring text-ink shadow-[0_5px_16px_-12px_rgba(18,20,25,0.55)]"
                : "border border-black/[0.08] bg-white/75 text-zinc-500 hover:border-black/[0.15] hover:bg-white hover:text-ink"
            }`}
          >
            <a.icon className={`h-4 w-4 ${isActive ? "text-brand-500" : "text-zinc-400"}`} />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 工作台核心：对标竞品的超大输入卡。
 * 一个输入框统一所有流程——异步 Agent 派活、上传报表触发同步复盘;
 * 左下「+ 添加」收附件，右下黑色发送。
 * 派活成功 / 复盘完成都通过回调交给上层会话流（TaskStream）渲染。
 */
export function AgentComposer({
  workspaceId,
  conversationId = "",
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
  directorMode = "create",
  onDirectorModeChange,
  showAssetChips = false,
  textareaRef,
  onDispatched,
  allowReview = true,
}: {
  workspaceId: string;
  /** 当前会话 ID:派活时带上则追加进该会话，空则后端新建一条。 */
  conversationId?: string;
  isGuest?: boolean;
  activeAgent: ComposerKind;
  onAgentChange: (k: ComposerKind) => void;
  input: string;
  onInputChange: (v: string) => void;
  /** 收藏接力带入的商品 ID:DIRECTOR/LISTING 派活时一并提交，后端注入真实商品数据并关联产出。 */
  productId?: string | null;
  onClearProduct?: () => void;
  /** 创作页工具链：商品/人设/素材选择（状态由 Workbench 持有，派活即清空）。 */
  onProductChange?: (id: string | null) => void;
  personaId?: string | null;
  onPersonaChange?: (id: string | null) => void;
  materialId?: string | null;
  onMaterialChange?: (id: string | null) => void;
  /** Listing 子模式：文案 / 上身图（试穿）;由 Workbench 持有。 */
  listingMode?: ListingMode;
  /** 传入则在底栏渲染「文案/上身图」分段开关：仅在没有快捷卡的会话页用（首页靠卡切换）。 */
  onListingModeChange?: (m: ListingMode) => void;
  /** 短视频子模式：做视频 / 视频解析；由 Workbench 持有。 */
  directorMode?: DirectorMode;
  /** 传入则在 DIRECTOR 底栏渲染「做视频/视频解析」分段开关。 */
  onDirectorModeChange?: (m: DirectorMode) => void;
  /** 是否在底栏展示资产选择器（创作页开）。 */
  showAssetChips?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** 任务创建成功（异步派活或同步复盘落库），新任务立即插入会话流。 */
  onDispatched?: (task: StreamTask) => void;
  /** 本页是否提供「上传报表复盘」入口（创作页没有 REVIEW,关掉附件按钮与拖拽）。 */
  allowReview?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  // 虚拟试穿内联选择器（选模特 + 服饰图）开关；复用 DIRECTOR/LISTING 的资产选择弹窗。
  const [tryOnPickerOpen, setTryOnPickerOpen] = useState(false);

  // 出片设置（目标市场/时长/比例）:仅短视频用，作为「偏好」跨条沿用（不随派活清空）,
  // 选项面板挂在 AssetChips 的「设置」chip 里。
  const [videoSettings, setVideoSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);

  // 复盘附件状态：选中报表后自动切到 REVIEW,移除则回到之前的 Agent。
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [targetRoi, setTargetRoi] = useState("3.0");
  const prevAgentRef = useRef<ComposerKind>("ANALYST");
  const fileRef = useRef<HTMLInputElement>(null);
  // 视频解析：上传的待解析视频（已落库为 VIDEO 素材）+ 上传中状态。
  const [analyzeVideo, setAnalyzeVideo] = useState<{ id: string; name: string } | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  const { open: openAuthModal } = useAuthModal();

  const isReview = activeAgent === "REVIEW";
  // 视频解析 = 短视频创作的子模式：输入是一条上传的视频，选填关注点，传完才可发。
  const isAnalyze = activeAgent === "DIRECTOR" && directorMode === "analyze";
  // 虚拟试穿 = Listing 的「上身图」子模式：输入是「模特 + 服饰图」两张图而非文字，凑齐才可发。
  const isTryOn = activeAgent === "LISTING" && listingMode === "tryon";
  const tryOnReady = !!personaId && (!!materialId || !!productId);
  const placeholder =
    isReview && attachedFile
      ? "可补充说明（选填），例：重点看 ROI 低于 2 的素材该停还是改"
      : isAnalyze
        ? "可选：想重点拆解什么？例：重点看开头钩子怎么写（留空=全面解析）"
        : PLACEHOLDERS[activeAgent];
  const canSend = attachedFile
    ? true
    : isTryOn
      ? tryOnReady
      : isAnalyze
        ? !!analyzeVideo && !uploadingVideo
        : !isReview && !!input.trim();

  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后交给 Agent",
      desc: "登录后可以提问、派活，并把每次对话和结果保存到工作台。",
    });
    return true;
  }

  function attach(f: File) {
    if (!allowReview) return;
    if (!REVIEW_EXTENSIONS.test(f.name)) {
      toast("请选择 .csv、.tsv 或 .xlsx 格式的投放报表");
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

  // 上传待解析视频：落库为该工作台的 VIDEO 素材，拿回 materialId 供派活引用。
  async function uploadVideo(f: File) {
    if (!f.type.startsWith("video/")) {
      toast("请选择视频文件（mp4 / mov 等）");
      return;
    }
    if (gateGuest()) return;
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error?.message || json?.message || "上传失败，稍后再试");
        return;
      }
      const m = json.data?.material ?? json.material;
      if (m?.id) setAnalyzeVideo({ id: m.id as string, name: (m.originalName as string) ?? f.name });
    } catch {
      toast.error("网络异常，上传失败");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function submitTask() {
    setSubmitting(true);
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/agent-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isAnalyze
          ? {
              // 视频解析：派活 VIDEO_ANALYSIS,带上传视频素材;input 作选填关注点 + 会话气泡标题
              ...(conversationId ? { conversationId } : {}),
              agent: "VIDEO_ANALYSIS",
              input: input.trim() || "解析视频脚本",
              ...(analyzeVideo ? { materialId: analyzeVideo.id } : {}),
            }
          : {
        // 归属会话：在某会话内派活则带上，新对话页留空由后端建会话
        ...(conversationId ? { conversationId } : {}),
        // 试穿子模式派活落 TRYON 任务（后端不变），其余按当前 Agent
        agent: isTryOn ? "TRYON" : activeAgent,
        // 试穿无文字指令（输入是两张图），给个默认 input 满足后端非空校验，也作会话气泡标题
        input: isTryOn ? input.trim() || "虚拟试穿" : input.trim(),
        // 创作类 + 试穿携带：DIRECTOR/LISTING 注入收藏真实数据;TRYON 用商品主图当服饰图
        ...((activeAgent === "DIRECTOR" || activeAgent === "LISTING" || isTryOn) && productId
          ? { productId }
          : {}),
        // 人设/模特：DIRECTOR 出镜口播,TRYON 作试穿模特
        ...((activeAgent === "DIRECTOR" || isTryOn) && personaId ? { modelAssetId: personaId } : {}),
        // 参考素材：DIRECTOR 首帧 / LISTING 出图参考 / TRYON 服饰图（优先于商品主图）
        ...((activeAgent === "DIRECTOR" || activeAgent === "LISTING" || isTryOn) && materialId
          ? { materialId }
          : {}),
        // 出片设置（仅短视频）:市场/比例总是显式带上；时长「自动」（null）时不发，交给 AI 配速
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
      toast.error(json?.error?.message || json?.message || "发送失败，稍后再试");
      return;
    }
    onInputChange("");
    setAnalyzeVideo(null);
    // 新任务气泡立即出现在输入框下方，无需跳转提示
    const task = (json.data?.task ?? json.task) as StreamTask | undefined;
    if (task) onDispatched?.(task);
    // 通知全局运行态信标（悬浮吉祥物）立刻进入进行中状态
    window.dispatchEvent(new Event(TASK_DISPATCHED_EVENT));
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
        toast.error(json?.message || "分析失败，请检查报表格式");
        return;
      }
      // 复盘已在后端落库为 REVIEW 任务，和异步派活走同一条流
      const r = json.data.result as ReviewResult;
      const task = json.data.task as StreamTask | null;
      if (task) onDispatched?.(task);
      setAttachedFile(null);
      onInputChange("");
      if (r.warnings?.length) toast.message(r.warnings[0]);
    } catch {
      toast.error("网络异常，稍后再试");
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
    if (isAnalyze) {
      if (uploadingVideo) return;
      if (!analyzeVideo) {
        toast("请先上传要解析的视频");
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
      className="dk-composer overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) attach(f);
        }}
      >
        {/* 关联商品 chip:收藏接力带入（创作页有 AssetChips 时由选择器展示，不重复出 chip） */}
        {!showAssetChips && !isTryOn && (activeAgent === "DIRECTOR" || activeAgent === "LISTING") && productId && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 py-1 pl-2 pr-1 text-xs font-medium text-violet-700">
              <Package className="h-3.5 w-3.5" />
              已关联选品商品 · 将注入其真实数据
              <button
                onClick={onClearProduct}
                className="rounded-full p-0.5 text-violet-400 hover:bg-violet-100 hover:text-violet-700"
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

        {/* 视频解析：已上传待解析视频 chip */}
        {isAnalyze && analyzeVideo && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 py-1 pl-2 pr-1 text-xs font-medium text-fuchsia-700">
              <FileVideo className="h-3.5 w-3.5" />
              <span className="max-w-48 truncate">{analyzeVideo.name}</span>
              <button
                onClick={() => setAnalyzeVideo(null)}
                className="rounded-full p-0.5 text-fuchsia-400 hover:bg-fuchsia-100 hover:text-fuchsia-700"
                aria-label="移除视频"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        {isTryOn ? (
          // 与非试穿的 textarea(rows=4)等高，切换 Agent 时输入卡不跳变
          <div className="flex min-h-40 items-center px-5 py-5 sm:px-6 sm:py-6">
            <p className="text-sm leading-relaxed text-zinc-500">
              选一位模特 + 一张服饰图（上传图，或收藏里带主图的商品）,AI 生成模特上身效果图。
            </p>
          </div>
        ) : (
          <textarea
            id="agent-composer"
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            rows={4}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            className="min-h-40 w-full resize-none bg-transparent px-5 pb-4 pt-5 text-[15px] leading-relaxed outline-none placeholder:text-zinc-400 sm:px-6 sm:pt-6"
          />
        )}

        {/* 操作区与输入面融为一体，减少后台表单式的分割感。 */}
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
          {/* 会话页没有快捷卡，用底栏分段开关切「文案/上身图」;首页该开关不渲染，改由快捷卡切换。 */}
          {activeAgent === "LISTING" && onListingModeChange && (
            <div className="inline-flex rounded-full border border-black/10 bg-zinc-50 p-0.5">
              <SubModeButton active={!isTryOn} icon={LayoutList} onClick={() => onListingModeChange("copy")}>
                文案
              </SubModeButton>
              <SubModeButton active={isTryOn} icon={Shirt} onClick={() => onListingModeChange("tryon")}>
                上身图
              </SubModeButton>
            </div>
          )}

          {/* 短视频：做视频 / 视频解析 分段开关 */}
          {activeAgent === "DIRECTOR" && onDirectorModeChange && (
            <div className="inline-flex rounded-full border border-black/10 bg-zinc-50 p-0.5">
              <SubModeButton active={!isAnalyze} icon={Clapperboard} onClick={() => onDirectorModeChange("create")}>
                做视频
              </SubModeButton>
              <SubModeButton active={isAnalyze} icon={ScanText} onClick={() => onDirectorModeChange("analyze")}>
                视频解析
              </SubModeButton>
            </div>
          )}

          {/* 视频解析：上传待解析视频 */}
          {isAnalyze && (
            <>
              <input
                ref={videoRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadVideo(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => {
                  if (gateGuest()) return;
                  videoRef.current?.click();
                }}
                disabled={uploadingVideo}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink disabled:opacity-50"
                title="上传要解析的带货视频"
              >
                {uploadingVideo ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploadingVideo ? "上传中…" : analyzeVideo ? "换一个视频" : "上传视频"}
              </button>
            </>
          )}

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
                title="上传 GMV Max 投放报表触发复盘"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                上传报表
              </button>
            </>
          )}

          {/* 虚拟试穿：选模特 + 服饰图，与复盘「上传报表」同处底栏左下角 */}
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

          {/* 创作工具链：商品 / 出镜人设 / 首帧素材（试穿、视频解析子模式不用这套，不重复出） */}
          {showAssetChips && !isTryOn && !isAnalyze && (
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
              <span className="hidden text-2xs text-zinc-400 lg:inline">⌘/Ctrl + Enter</span>
            )}
            <button
              onClick={submit}
              disabled={submitting || !canSend}
              className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-[#1c1d1f] px-5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-black disabled:pointer-events-none disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : attachedFile ? (
                <Sparkles className="h-4 w-4" />
              ) : isTryOn ? (
                <Shirt className="h-4 w-4" />
              ) : isAnalyze ? (
                <ScanText className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting
                ? attachedFile
                  ? "分析中…"
                  : isTryOn
                    ? "生成中…"
                    : isAnalyze
                      ? "解析中…"
                      : "发送中…"
                : attachedFile
                  ? "开始复盘"
                  : isTryOn
                    ? "生成上身图"
                    : isAnalyze
                      ? "开始解析"
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

/** Listing 子模式分段按钮：选中白底浮起，未选灰字。 */
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

/** 虚拟试穿内联选择状态小药丸：已选 brand 勾，未选灰点。 */
function AssetStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium ${
        ok
          ? "border-violet-200 bg-violet-50 text-violet-700"
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
