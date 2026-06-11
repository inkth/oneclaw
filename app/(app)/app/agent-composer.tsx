"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Loader2,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { type ReviewResult } from "@/lib/review/types";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";
import { type StreamTask } from "./task-stream";

// 走后端 agent-tasks 的异步 Agent;REVIEW 是前端同步复盘模式(上传报表 → 就地仪表盘)。
export type ComposerKind = "ANALYST" | "DIRECTOR" | "LISTING" | "REVIEW";

/** 胶囊行展示的 Agent。 */
const PILL_AGENTS = (["ANALYST", "DIRECTOR", "LISTING", "REVIEW"] as const).map(
  (kind) => ({ kind: kind as ComposerKind, ...AGENT_IDENTITY[kind] }),
);

const PLACEHOLDERS: Record<ComposerKind, string> = {
  ANALYST: "例:东南亚母婴本周新爆品,毛利 40%+,月销 2K+",
  DIRECTOR: "例:为推荐榜首产品生成一条 UGC 风格 TikTok 带货短视频,真人开箱口播感",
  LISTING: "例:为「便携榨汁杯」生成 TikTok Shop Listing:标题、五点卖点、A+ 结构、主图方案",
  REVIEW: "点左下角「+ 添加」上传 GMVMax 投放报表(.csv / .xlsx),即可开始复盘",
};

const REVIEW_EXTENSIONS = /\.(csv|tsv|xlsx)$/i;

// 复盘走 Go 后端 workspace 端点(multipart 上传),与 agent-tasks 的 JSON 流程并行。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** 胶囊行:图标 + 名称,激活态彩虹发丝环。独立于输入卡,由 Workbench 居中排布。 */
export function AgentPills({
  active,
  onChange,
}: {
  active: ComposerKind;
  onChange: (k: ComposerKind) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {PILL_AGENTS.map((a) => {
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
  textareaRef,
  onDispatched,
}: {
  workspaceId: string;
  isGuest?: boolean;
  activeAgent: ComposerKind;
  onAgentChange: (k: ComposerKind) => void;
  input: string;
  onInputChange: (v: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** 任务创建成功(异步派活或同步复盘落库),新任务立即插入会话流。 */
  onDispatched?: (task: StreamTask) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  // 复盘附件状态:选中报表后自动切到 REVIEW,移除则回到之前的 Agent。
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [targetRoi, setTargetRoi] = useState("3.0");
  const prevAgentRef = useRef<ComposerKind>("ANALYST");
  const fileRef = useRef<HTMLInputElement>(null);

  const isReview = activeAgent === "REVIEW";
  const placeholder =
    isReview && attachedFile
      ? "可补充说明(选填),例:重点看 ROI 低于 2 的素材该停还是改"
      : PLACEHOLDERS[activeAgent];
  const canSend = attachedFile ? true : !isReview && !!input.trim();

  function gateGuest(): boolean {
    if (!isGuest) return false;
    toast("登录后即可使用 Agent", {
      action: {
        label: "去登录",
        onClick: () => {
          window.location.href = "/login?callbackUrl=/app";
        },
      },
    });
    return true;
  }

  function attach(f: File) {
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
      body: JSON.stringify({ agent: activeAgent, input: input.trim() }),
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
      toast.error("请先登录后再上传报表");
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
      toast("先点左下角「+ 添加」上传投放报表");
      return;
    }
    if (!input.trim()) return;
    await submitTask();
  }

  return (
    <div
      className="dk-card overflow-hidden transition-shadow focus-within:border-black/15"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) attach(f);
        }}
      >
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

        {/* 底栏:左「+ 添加」附件,右黑色发送 */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
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
            <Plus className="h-3.5 w-3.5" />
            添加
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline text-2xs text-zinc-400">⌘/Ctrl + Enter 发送</span>
            <button
              onClick={submit}
              disabled={submitting || !canSend}
              className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : attachedFile ? (
                <Sparkles className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting ? (attachedFile ? "分析中…" : "发送中…") : attachedFile ? "开始复盘" : "发送"}
            </button>
          </div>
        </div>
    </div>
  );
}
