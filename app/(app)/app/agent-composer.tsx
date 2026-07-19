"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Clapperboard,
  FileSpreadsheet,
  FileVideo,
  ImagePlus,
  Loader2,
  Package,
  ScanText,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { type ReviewResult } from "@/lib/review/types";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { ComposerSendButton, ComposerSurface, ComposerTextarea, ComposerToolbar } from "@/components/ui/Composer";
import { CreditCost } from "@/components/ui/CreditCost";
import { Popover, ToolbarButton } from "@/components/ui/Popover";
import { CREDIT_COST } from "@/lib/credits";
import { type StreamTask } from "./task-stream";
import { TASK_DISPATCHED_EVENT } from "./floating-mascot";
import {
  AssetChips,
  DEFAULT_VIDEO_SETTINGS,
  type DiscoverSelection,
  type TaskReferenceSelection,
  type VideoSettings,
} from "./create/asset-chips";

// 走后端 agent-tasks 的异步 Agent;REVIEW 是前端同步复盘模式（上传报表 → 就地仪表盘）。
// TRYON 不再是独立胶囊：LISTING 同时带模特与商品图时自动附加 TRYON 任务，故不在 PILL_AGENTS。
// ADVISOR 是对话式跨境顾问（答疑/排路线），与其他 Agent 同流程（照常计积分），排在产出型胶囊之前。
export type ComposerKind = "ADVISOR" | "ANALYST" | "DIRECTOR" | "LISTING" | "TRYON" | "REVIEW";

/** 短视频创作的两个子模式：做视频（写脚本→出片）与视频解析（拆解一条参考带货视频）。 */
export type DirectorMode = "create" | "analyze";

/** 胶囊行展示的 Agent(5 个；虚拟试穿由 Listing 按附件自动触发)。顾问打头：新手先问路，再派活。 */
const PILL_AGENTS = (["ADVISOR", "ANALYST", "DIRECTOR", "LISTING", "REVIEW"] as const).map((kind) => ({
  kind: kind as ComposerKind,
  ...AGENT_IDENTITY[kind],
}));

const AGENT_DESCRIPTIONS: Record<Exclude<ComposerKind, "TRYON">, string> = {
  ADVISOR: "答疑、拆解问题并规划下一步",
  ANALYST: "判断市场机会、竞争和利润空间",
  DIRECTOR: "产出脚本、分镜和短视频素材",
  LISTING: "生成标题、卖点和商品详情内容",
  REVIEW: "分析投放报表并给出优化建议",
};

const PLACEHOLDERS: Record<ComposerKind, string> = {
  ADVISOR: "例：预算 5000 元，没有货源，想做美国市场，我该从哪一步开始？也可直接粘贴图片",
  ANALYST: "例：从美国爆品榜挑 3 个高佣金、仍在增长的潜力商品，可直接粘贴图片",
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
            className={`group inline-flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 ${
              isActive
                ? "dk-ring text-ink shadow-[0_5px_16px_-12px_rgba(18,20,25,0.55)]"
                : "border border-black/[0.08] bg-white/75 text-zinc-500 hover:border-black/[0.15] hover:bg-white hover:text-ink"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-[opacity,filter] ${a.iconSurface} ${
                isActive ? "opacity-100" : "opacity-65 saturate-75 group-hover:opacity-90 group-hover:saturate-100"
              }`}
            >
              <a.icon className="h-3.5 w-3.5" />
            </span>
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
  discoverSelection,
  onDiscoverSelectionChange,
  referenceTask,
  onReferenceTaskChange,
  personaId,
  onPersonaChange,
  materialIds = [],
  onMaterialIdsChange,
  directorMode = "create",
  onDirectorModeChange,
  showAssetChips = false,
  textareaRef,
  onDispatched,
  allowReview = true,
  compactAgentSelector = false,
  agentKinds,
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
  discoverSelection?: DiscoverSelection | null;
  onDiscoverSelectionChange?: (selection: DiscoverSelection | null) => void;
  referenceTask?: TaskReferenceSelection | null;
  onReferenceTaskChange?: (selection: TaskReferenceSelection | null) => void;
  personaId?: string | null;
  onPersonaChange?: (id: string | null) => void;
  materialIds?: string[];
  onMaterialIdsChange?: (ids: string[]) => void;
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
  /** 已进入具体会话后，把平铺 Agent 收成输入框内的单一切换入口。 */
  compactAgentSelector?: boolean;
  /** 当前页面允许选择的主 Agent 子集。 */
  agentKinds?: ComposerKind[];
}) {
  const [submitting, setSubmitting] = useState(false);

  // 出片设置（目标市场/时长/比例）:仅短视频用，作为「偏好」跨条沿用（不随派活清空）,
  // 选项面板挂在 AssetChips 的「设置」chip 里。
  const [videoSettings, setVideoSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);

  // 复盘附件状态：选中报表后自动切到 REVIEW,移除则回到之前的 Agent。
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [targetRoi, setTargetRoi] = useState("3.0");
  const prevAgentRef = useRef<ComposerKind>("ANALYST");
  const fileRef = useRef<HTMLInputElement>(null);
  // 视频解析：上传的待解析视频（已落库为 VIDEO 素材）+ 上传中状态。
  const [analyzeVideo, setAnalyzeVideo] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  // 顾问 / 选品只保留一个直达动作：点「添加图片」后立即打开系统图片选择器。
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadingImageRef = useRef(false);
  const [imagePreviews, setImagePreviews] = useState<{ id: string; name: string; url: string }[]>([]);
  const [pendingImagePreviews, setPendingImagePreviews] = useState<{ id: string; name: string; url: string }[]>([]);
  const contextImageRef = useRef<HTMLInputElement>(null);
  const { open: openAuthModal } = useAuthModal();

  const isReview = activeAgent === "REVIEW";
  const activeIdentity = AGENT_IDENTITY[activeAgent];
  const selectableAgents = agentKinds ? PILL_AGENTS.filter((agent) => agentKinds.includes(agent.kind)) : PILL_AGENTS;
  // 视频解析 = 短视频创作的子模式：输入是一条上传的视频，选填关注点，传完才可发。
  const isAnalyze = activeAgent === "DIRECTOR" && directorMode === "analyze";
  const isListing = activeAgent === "LISTING";
  const isImageContextAgent = activeAgent === "ADVISOR" || activeAgent === "ANALYST";
  const hasContextImage = isImageContextAgent && (materialIds?.length ?? 0) > 0;
  const visibleImagePreviews = imagePreviews.filter((preview) => materialIds.includes(preview.id));
  const displayedImagePreviews =
    pendingImagePreviews.length > 0 && !isListing
      ? pendingImagePreviews
      : [...visibleImagePreviews, ...pendingImagePreviews];
  const listingHasAssets = !!productId || !!personaId || (materialIds?.length ?? 0) > 0;
  const includesTryOn = isListing && !!personaId && (!!productId || (materialIds?.length ?? 0) > 0);
  const advisorHasContext = activeAgent === "ADVISOR" && (!!productId || !!discoverSelection || !!referenceTask || hasContextImage);
  const analystHasContext = activeAgent === "ANALYST" && (!!productId || !!discoverSelection || hasContextImage);
  const placeholder =
    isReview && attachedFile
      ? "可补充说明（选填），例：重点看 ROI 低于 2 的素材该停还是改"
      : isAnalyze
        ? "可选：想重点拆解什么？例：重点看开头钩子怎么写（留空=全面解析）"
        : PLACEHOLDERS[activeAgent];
  const canSend =
    !uploadingImage &&
    (attachedFile
      ? true
      : isAnalyze
        ? !!analyzeVideo && !uploadingVideo
        : !isReview && (!!input.trim() || (isListing && listingHasAssets) || advisorHasContext || analystHasContext));

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
      if (m?.id)
        setAnalyzeVideo({
          id: m.id as string,
          name: (m.originalName as string) ?? f.name,
        });
    } catch {
      toast.error("网络异常，上传失败");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function uploadImageMaterial(f: File): Promise<{ id: string; name: string; url: string }> {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials`, {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error?.message || json?.message || "上传失败，稍后再试");
    }
    const material = json.data?.material ?? json.material;
    if (!material?.id) throw new Error("上传成功，但没有拿到图片信息");
    return {
      id: material.id as string,
      name: (material.originalName as string) || f.name || "粘贴的图片",
      url: (material.url as string) || "",
    };
  }

  async function uploadComposerImages(files: File[], source: "picker" | "paste") {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      toast("请选择图片文件");
      return;
    }
    if (images.some((file) => file.size > 50 * 1024 * 1024)) {
      toast("图片不能超过 50 MB");
      return;
    }
    if (gateGuest()) return;
    if (uploadingImageRef.current) {
      toast("上一张图片还在上传，请稍候");
      return;
    }

    const availableSlots = isListing ? Math.max(0, 8 - materialIds.length) : 1;
    if (availableSlots === 0) {
      toast("Listing 最多添加 8 张图片");
      return;
    }
    const accepted = images.slice(0, availableSlots);
    const pendingPreviews = accepted.map((file, index) => ({
      id: `pending-${Date.now()}-${index}`,
      name: file.name || "粘贴的图片",
      url: URL.createObjectURL(file),
    }));
    uploadingImageRef.current = true;
    setPendingImagePreviews(pendingPreviews);
    setUploadingImage(true);
    try {
      const uploaded: { id: string; name: string; url: string }[] = [];
      for (const file of accepted) {
        uploaded.push(await uploadImageMaterial(file));
      }

      const nextIds = isListing
        ? Array.from(new Set([...materialIds, ...uploaded.map((material) => material.id)])).slice(0, 8)
        : [uploaded[uploaded.length - 1].id];
      onMaterialIdsChange?.(nextIds);
      setImagePreviews((current) => {
        const byId = new Map([...current, ...uploaded].map((preview) => [preview.id, preview]));
        return nextIds.flatMap((id) => {
          const preview = byId.get(id);
          return preview ? [preview] : [];
        });
      });

      if (source === "paste") {
        toast.success(uploaded.length > 1 ? `已粘贴 ${uploaded.length} 张图片` : "图片已粘贴");
      }
      if (images.length > accepted.length) {
        toast.message(`已达到图片上限，本次添加 ${accepted.length} 张`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "网络异常，上传失败");
    } finally {
      pendingPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
      setPendingImagePreviews([]);
      uploadingImageRef.current = false;
      setUploadingImage(false);
    }
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const itemImages = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    const images =
      itemImages.length > 0
        ? itemImages
        : Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;

    if (isReview || isAnalyze || !["ADVISOR", "ANALYST", "DIRECTOR", "LISTING"].includes(activeAgent)) {
      toast("当前模式不支持粘贴图片");
      return;
    }
    // 不 preventDefault：剪贴板同时含文字和图片时，textarea 仍按原生行为粘贴文字。
    void uploadComposerImages(images, "paste");
  }

  function removeComposerImage(id: string) {
    onMaterialIdsChange?.(materialIds.filter((materialId) => materialId !== id));
    setImagePreviews((current) => current.filter((preview) => preview.id !== id));
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
              agent: activeAgent,
              // Listing 允许只选附件不写文字，后端仍需要一条会话气泡标题。
              input:
                input.trim() ||
                (isListing && listingHasAssets
                  ? "根据所选商品与素材生成 Listing"
                  : activeAgent === "ANALYST" && analystHasContext
                    ? "帮我判断这个商品是否值得做"
                    : activeAgent === "ADVISOR" && advisorHasContext
                      ? "请结合我添加的资料给出下一步建议"
                      : ""),
              // 商品档案可作为顾问、选品和创作上下文。
              ...(["ADVISOR", "ANALYST", "DIRECTOR", "LISTING"].includes(activeAgent) && productId ? { productId } : {}),
              ...(["ADVISOR", "ANALYST"].includes(activeAgent) && discoverSelection
                ? {
                    discoverProductId: discoverSelection.productId,
                    discoverRegion: discoverSelection.region,
                  }
                : {}),
              ...(activeAgent === "ADVISOR" && referenceTask ? { referenceTaskId: referenceTask.id } : {}),
              // DIRECTOR 用作出镜人设；LISTING 同时有商品图时会自动附加上身图。
              ...((activeAgent === "DIRECTOR" || isListing) && personaId ? { modelAssetId: personaId } : {}),
              // 顾问/选品把单张图片交给多模态模型；视频保持单张首帧；Listing 接收多张商品/细节图。
              ...(["ADVISOR", "ANALYST", "DIRECTOR"].includes(activeAgent) && materialIds?.[0]
                ? { materialId: materialIds[0] }
                : {}),
              ...(isListing && (materialIds?.length ?? 0) > 0 ? { materialIds } : {}),
              // 出片设置（仅短视频）:市场/比例总是显式带上；时长「自动」（null）时不发，交给 AI 配速
              ...(activeAgent === "DIRECTOR"
                ? {
                    region: videoSettings.region,
                    ...(videoSettings.duration ? { durationSec: videoSettings.duration } : {}),
                    aspectRatio: videoSettings.aspect,
                  }
                : {}),
            },
      ),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || json?.message || "发送失败，稍后再试");
      return;
    }
    if (json.data?.tryOnError) {
      toast.warning("Listing 已发送，但上身图任务创建失败，可稍后重试");
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
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/review/analyze`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
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
    if (uploadingImage) {
      toast("图片正在上传，请稍候");
      return;
    }
    if (attachedFile) {
      await analyze();
      return;
    }
    if (isReview) {
      toast("先点左下角「上传报表」上传投放报表");
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
    if (!input.trim() && !(isListing && listingHasAssets) && !advisorHasContext && !analystHasContext) return;
    await submitTask();
  }

  const imagePreviewTray =
    displayedImagePreviews.length > 0 ? (
      <div
        className={
          compactAgentSelector
            ? "flex h-14 shrink-0 gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5"
            : "flex h-16 shrink-0 gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:h-[4.75rem] sm:px-5 sm:py-1.5"
        }
        aria-label="已添加图片"
      >
        {displayedImagePreviews.map((preview, index) => {
          const pending = preview.id.startsWith("pending-");
          return (
            <div
              key={preview.id}
              className={`group relative shrink-0 overflow-hidden rounded-xl border border-[var(--dk-stroke-border)] bg-[var(--dk-surface-2)] ${
                compactAgentSelector ? "h-10 w-10" : "h-12 w-12 sm:h-16 sm:w-16"
              }`}
              title={preview.name}
            >
              {preview.url ? (
                <Image
                  src={preview.url}
                  alt={`已添加图片 ${index + 1}`}
                  fill
                  sizes={compactAgentSelector ? "40px" : "(min-width: 640px) 64px, 48px"}
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sky-600">
                  <ImagePlus className="h-5 w-5" />
                </span>
              )}
              {pending ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/25" aria-label="图片上传中">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeComposerImage(preview.id)}
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white shadow-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={`移除图片 ${index + 1}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <ComposerSurface
        variant="console"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) attach(f);
        }}
      >
        {compactAgentSelector && (
          <div className="flex items-center px-4 pt-3.5 sm:px-5">
            <Popover
              align="start"
              panelClassName="w-[min(21rem,calc(100vw-3rem))] p-2"
              trigger={({ open }) => (
                <span
                  className={`inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-2.5 text-xs font-medium transition-colors ${
                    open
                      ? "border-black/15 bg-[var(--dk-action-regular)] text-ink"
                      : "border-[var(--dk-stroke-border)] bg-[var(--dk-surface)] text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)] hover:text-ink"
                  }`}
                >
                  <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-lg border ${activeIdentity.iconSurface}`}>
                    <activeIdentity.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[var(--dk-content-tertiary)]">当前 Agent</span>
                  <span className="text-ink">{activeIdentity.label}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-[var(--dk-content-tertiary)] transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </span>
              )}
            >
              {({ close }) => (
                <div>
                  <div className="px-2 pb-2 pt-1">
                    <div className="text-xs font-semibold text-ink">选择接下来回答的 Agent</div>
                    <div className="mt-0.5 text-2xs text-[var(--dk-content-tertiary)]">保留当前对话，仅影响下一次发送</div>
                  </div>
                  <div className="space-y-0.5">
                    {selectableAgents.map((agent) => {
                      const selected = agent.kind === activeAgent;
                      return (
                        <button
                          key={agent.kind}
                          type="button"
                          onClick={() => {
                            onAgentChange(agent.kind);
                            close();
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors ${
                            selected ? "bg-[var(--dk-action-regular)]" : "hover:bg-[var(--dk-action-regular)]"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${agent.iconSurface}`}
                          >
                            <agent.icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-ink">{agent.label}</span>
                            <span className="mt-0.5 block truncate text-xs text-[var(--dk-content-secondary)]">
                              {AGENT_DESCRIPTIONS[agent.kind as Exclude<ComposerKind, "TRYON">]}
                            </span>
                          </span>
                          {selected && <Check className="h-4 w-4 shrink-0 text-ink" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Popover>
          </div>
        )}

        {/* 关联商品 chip:收藏接力带入（创作页有 AssetChips 时由选择器展示，不重复出 chip） */}
        {!showAssetChips && (activeAgent === "DIRECTOR" || activeAgent === "LISTING") && productId && (
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

        {/* 图片与文字共享固定内容高度，首页和会话页粘贴图片后都不会撑高整张输入卡。 */}
        <div className={compactAgentSelector ? "flex h-28 min-h-28 flex-col" : "flex h-40 min-h-40 flex-col"}>
          {imagePreviewTray}

          <ComposerTextarea
            variant="console"
            id="agent-composer"
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onPaste={handleComposerPaste}
            rows={compactAgentSelector ? 2 : 4}
            placeholder={placeholder}
            className={
              compactAgentSelector
                ? "min-h-0 flex-1 overflow-y-auto py-2.5 sm:py-2.5"
                : "min-h-0 flex-1 overflow-y-auto"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
        </div>

        {/* 操作区与输入面融为一体，减少后台表单式的分割感。 */}
        <ComposerToolbar variant="console">
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
                {uploadingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
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

          {/* 顾问 / 选品：点击后直接选择并上传一张图片。 */}
          {showAssetChips && isImageContextAgent && !isAnalyze && (
            <>
              <input
                ref={contextImageRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadComposerImages([f], "picker");
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (gateGuest()) return;
                  contextImageRef.current?.click();
                }}
                disabled={uploadingImage}
                className="rounded-xl disabled:pointer-events-none disabled:opacity-60"
                title={hasContextImage ? "更换图片" : "添加图片"}
              >
                <ToolbarButton
                  icon={uploadingImage ? Loader2 : ImagePlus}
                  label={uploadingImage ? "上传中…" : hasContextImage ? "更换图片" : "添加图片"}
                  active={hasContextImage}
                  badge={hasContextImage ? 1 : undefined}
                />
              </button>
            </>
          )}

          {/* 创作工具链：商品 / 模特 / 参考素材；视频解析用专门的上传入口。 */}
          {showAssetChips && !isImageContextAgent && !isAnalyze && (
            <AssetChips
              workspaceId={workspaceId}
              activeAgent={activeAgent}
              productId={productId ?? null}
              onProductChange={(id) => onProductChange?.(id)}
              discoverSelection={discoverSelection ?? null}
              onDiscoverSelectionChange={(selection) => onDiscoverSelectionChange?.(selection)}
              referenceTask={referenceTask ?? null}
              onReferenceTaskChange={(selection) => onReferenceTaskChange?.(selection)}
              personaId={personaId ?? null}
              onPersonaChange={(id) => onPersonaChange?.(id)}
              materialIds={materialIds ?? []}
              onMaterialIdsChange={(ids) => onMaterialIdsChange?.(ids)}
              videoSettings={videoSettings}
              onVideoSettingsChange={setVideoSettings}
              gate={gateGuest}
            />
          )}

          <div className="ml-auto flex items-center gap-2">
            {!isReview && !attachedFile && (
              <CreditCost credits={includesTryOn ? CREDIT_COST.agentTask * 2 + CREDIT_COST.image : CREDIT_COST.agentTask} />
            )}
            <span className="hidden text-2xs text-zinc-400 lg:inline">⌘/Ctrl + Enter</span>
            <ComposerSendButton
              type="button"
              onClick={submit}
              disabled={submitting || !canSend}
              className="h-11 text-[15px] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:opacity-100 disabled:shadow-none"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : attachedFile ? (
                <Sparkles className="h-4 w-4" />
              ) : isAnalyze ? (
                <ScanText className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting
                ? attachedFile
                  ? "分析中…"
                  : isAnalyze
                    ? "解析中…"
                    : "发送中…"
                : attachedFile
                  ? "开始复盘"
                  : isAnalyze
                    ? "开始解析"
                    : "发送"}
            </ComposerSendButton>
          </div>
        </ComposerToolbar>
      </ComposerSurface>
    </>
  );
}

/** 子模式分段按钮：选中白底浮起，未选灰字。 */
function SubModeButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof Clapperboard;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${active ? "bg-white text-ink shadow-sm" : "text-zinc-500 hover:text-ink"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
