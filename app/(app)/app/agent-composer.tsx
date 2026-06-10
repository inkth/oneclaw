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
    solid: "bg-brand-600",
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
 * Agent 选择收成输入框下方的并列按钮，发送后刷新页面，新任务落到下方「最近 Agent 任务」。
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
    toast("登录后即可发送任务", {
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

  return (
    <div className="dk-card overflow-hidden transition-shadow focus-within:border-black/15">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        placeholder={activeMeta.placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
      />

      {/* 工具栏：把 Agent 选择收成并列按钮（照搬 Designkit：激活态白底彩虹环） */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {AGENTS.map((a) => {
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

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline text-2xs text-zinc-400">⌘/Ctrl + Enter 发送</span>
          <button
            onClick={submit}
            disabled={submitting || !input.trim()}
            className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
