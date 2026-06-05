"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, TrendingUp, Video, Globe } from "lucide-react";

type AgentKind = "ANALYST" | "DIRECTOR" | "OPERATOR";

const AGENTS = [
  {
    kind: "ANALYST" as AgentKind,
    name: "市场分析师",
    placeholder: "例：东南亚母婴本周新爆品，毛利 40%+",
    icon: TrendingUp,
    solid: "bg-indigo-600",
  },
  {
    kind: "DIRECTOR" as AgentKind,
    name: "创意总监",
    placeholder: "例：为推荐榜首产品生成 4 条 TikTok 短视频",
    icon: Video,
    solid: "bg-violet-600",
  },
  {
    kind: "OPERATOR" as AgentKind,
    name: "品牌运营官",
    placeholder: "例：把本周视频排到 TikTok / IG / YouTube 三个平台",
    icon: Globe,
    solid: "bg-fuchsia-600",
  },
];

/**
 * 工作台核心：以聊天框为中心给三位 Agent 派活。
 * Agent 选择收成输入框下方的并列按钮，派发后刷新页面，新任务落到下方「最近 Agent 任务」。
 */
export function AgentComposer({
  workspaceId,
  isGuest = false,
}: {
  workspaceId: string;
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [activeAgent, setActiveAgent] = useState<AgentKind>("ANALYST");
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeMeta = AGENTS.find((a) => a.kind === activeAgent)!;

  function gateGuest(): boolean {
    if (!isGuest) return false;
    toast("登录后即可派发任务", {
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
    if (!input.trim() || submitting) return;
    if (gateGuest()) return;
    setSubmitting(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/agent-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: activeAgent, input: input.trim() }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || "派发失败");
      return;
    }
    setInput("");
    toast.success("已派发，Agent 正在工作", {
      action: { label: "查看进度", onClick: () => router.push("/app/agents") },
    });
    // 让下方「最近 Agent 任务」刷新出新任务
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        placeholder={activeMeta.placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="w-full resize-none rounded-t-2xl bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
      />

      {/* 工具栏：把 Agent 选择收成并列按钮 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-3 py-2.5">
        {AGENTS.map((a) => {
          const active = a.kind === activeAgent;
          return (
            <button
              key={a.kind}
              onClick={() => setActiveAgent(a.kind)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? `${a.solid} text-white`
                  : "border border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <a.icon className="h-3.5 w-3.5" />
              {a.name}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline text-2xs text-zinc-400">⌘/Ctrl + Enter 派发</span>
          <button
            onClick={submit}
            disabled={submitting || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            派发
          </button>
        </div>
      </div>
    </div>
  );
}
