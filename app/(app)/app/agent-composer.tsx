"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpFromLine,
  BarChart3,
  FileSpreadsheet,
  Loader2,
  Send,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";
import { type ReviewResult } from "@/lib/review/types";
import { ReviewResults } from "./review-panel";

// 走后端 agent-tasks 的异步 Agent。
type AgentKind = "ANALYST" | "DIRECTOR";
// 复盘是前端特殊模式：上传报表 → 同步出仪表盘，不落 agent-tasks 列表。
type ComposerKind = AgentKind | "REVIEW";

type ChatAgent = {
  kind: AgentKind;
  name: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
};

const CHAT_AGENTS: ChatAgent[] = [
  {
    kind: "ANALYST",
    name: "市场分析师",
    placeholder: "例：东南亚母婴本周新爆品，毛利 40%+",
    icon: TrendingUp,
  },
  {
    kind: "DIRECTOR",
    name: "创意总监",
    placeholder: "例：为推荐榜首产品生成一条 TikTok 短视频，叙事角度你帮我挑",
    icon: Video,
  },
];

// 复盘走 Go 后端 workspace 端点（multipart 上传），与 agent-tasks 的 JSON 流程并行。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/**
 * 工作台核心：以聊天框为中心给 Agent 派活。
 * 异步 Agent（分析师/创意总监）发送后落到下方「最近 Agent 任务」；
 * 「店铺投流数据分析」为同步复盘 Agent：选中后主体换为报表上传区，结果就地渲染仪表盘。
 */
export function AgentComposer({
  workspaceId,
  isGuest = false,
}: {
  workspaceId: string;
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [activeAgent, setActiveAgent] = useState<ComposerKind>("ANALYST");
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 复盘模式状态
  const [file, setFile] = useState<File | null>(null);
  const [targetRoi, setTargetRoi] = useState("3.0");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isReview = activeAgent === "REVIEW";
  const activeChat = CHAT_AGENTS.find((a) => a.kind === activeAgent);

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

  async function submit() {
    if (!input.trim() || submitting || isReview) return;
    if (gateGuest()) return;
    setSubmitting(true);
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/agent-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: activeAgent, input: input.trim() }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || "发送失败");
      return;
    }
    setInput("");
    toast.success("已发送，Agent 正在工作", {
      action: { label: "查看进度", onClick: () => router.push("/app") },
    });
    // 让下方「最近 Agent 任务」刷新出新任务
    router.refresh();
  }

  function onPick(f: File | null) {
    setFile(f);
    setResult(null);
  }

  async function analyze() {
    if (analyzing) return;
    if (gateGuest()) return;
    if (!workspaceId) {
      toast.error("请先登录后再上传报表");
      return;
    }
    if (!file) {
      toast.error("先选择 GMVMax 报表文件");
      return;
    }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
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
      const r = json.data.result as ReviewResult;
      setResult(r);
      if (r.warnings?.length) toast.message(r.warnings[0]);
      else toast.success("复盘完成");
    } catch {
      toast.error("网络异常，稍后再试");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="dk-card overflow-hidden transition-shadow focus-within:border-black/15">
        {isReview ? (
          /* 复盘模式：报表上传 + ROI 目标 */
          <div className="space-y-3 px-3 pt-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onPick(f);
              }}
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-7 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.xlsx,text/csv"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-zinc-200">
                {file ? <FileSpreadsheet className="h-5 w-5" /> : <ArrowUpFromLine className="h-5 w-5" />}
              </div>
              {file ? (
                <div className="text-sm font-medium text-zinc-800">{file.name}</div>
              ) : (
                <>
                  <div className="text-sm font-medium text-zinc-700">点击或拖入 Creative Hub 报表</div>
                  <div className="text-2xs text-zinc-400">
                    支持 .csv / .tsv / .xlsx，需含 Cost、GMV、曝光、点击、订单、完播率等列
                  </div>
                </>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              ROI 目标
              <input
                type="number"
                step="0.1"
                min="0"
                value={targetRoi}
                onChange={(e) => setTargetRoi(e.target.value)}
                className="h-9 w-20 rounded-lg border border-zinc-200 px-2 text-sm tabular-nums focus:border-brand-400 focus:outline-none"
              />
              <span className="text-2xs text-zinc-400">象限以此为高/低 ROI 分界</span>
            </label>
          </div>
        ) : (
          /* 对话模式：异步派活 */
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder={activeChat?.placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
          />
        )}

        {/* 工具栏：Agent 选择（照搬 Designkit：激活态白底彩虹环）+ 主操作按钮 */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {CHAT_AGENTS.map((a) => {
            const active = a.kind === activeAgent;
            return (
              <button
                key={a.kind}
                onClick={() => setActiveAgent(a.kind)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "dk-ring text-ink"
                    : "border border-black/10 bg-white text-zinc-600 hover:border-black/20 hover:text-ink"
                }`}
              >
                <a.icon className="h-3.5 w-3.5" />
                {a.name}
              </button>
            );
          })}
          <button
            onClick={() => setActiveAgent("REVIEW")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isReview
                ? "dk-ring text-ink"
                : "border border-black/10 bg-white text-zinc-600 hover:border-black/20 hover:text-ink"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            店铺投流数据分析
          </button>

          <div className="ml-auto flex items-center gap-2">
            {isReview ? (
              <button
                onClick={analyze}
                disabled={analyzing || !file}
                className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50 disabled:pointer-events-none"
              >
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analyzing ? "分析中…" : "开始复盘"}
              </button>
            ) : (
              <>
                <span className="hidden sm:inline text-2xs text-zinc-400">⌘/Ctrl + Enter 发送</span>
                <button
                  onClick={submit}
                  disabled={submitting || !input.trim()}
                  className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50 disabled:pointer-events-none"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  发送
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 复盘结果仪表盘就地渲染（仅复盘模式） */}
      {isReview && result && <ReviewResults result={result} />}
    </div>
  );
}
