"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  TrendingUp,
  Video,
  Globe,
  CheckCircle2,
  XCircle,
  CircleDashed,
} from "lucide-react";

type AgentKind = "ANALYST" | "DIRECTOR" | "OPERATOR";
type TaskStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

type Task = {
  id: string;
  agent: AgentKind;
  input: string;
  output: string | null;
  status: TaskStatus;
  createdAt: string;
  costCents?: number | null;
  model?: string | null;
};

const agents = [
  {
    kind: "ANALYST" as AgentKind,
    name: "市场分析师",
    placeholder: "例：东南亚母婴本周新爆品，毛利 40%+",
    icon: TrendingUp,
    tone: "indigo",
  },
  {
    kind: "DIRECTOR" as AgentKind,
    name: "创意总监",
    placeholder: "例：为推荐榜首产品生成 4 条 TikTok 短视频",
    icon: Video,
    tone: "violet",
  },
  {
    kind: "OPERATOR" as AgentKind,
    name: "品牌运营官",
    placeholder: "例：把本周视频排到 TikTok / IG / YouTube 三个平台",
    icon: Globe,
    tone: "fuchsia",
  },
];

const toneMap = {
  indigo: { btn: "from-indigo-500 to-indigo-600", chip: "bg-indigo-50 text-indigo-700" },
  violet: { btn: "from-violet-500 to-violet-600", chip: "bg-violet-50 text-violet-700" },
  fuchsia: { btn: "from-fuchsia-500 to-fuchsia-600", chip: "bg-fuchsia-50 text-fuchsia-700" },
} as const;

export function AgentRunner({
  workspaceId,
  initialTasks,
  isGuest = false,
}: {
  workspaceId: string;
  initialTasks: Task[];
  isGuest?: boolean;
}) {
  const router = useRouter();

  function gateGuest(): boolean {
    if (!isGuest) return false;
    toast("登录后即可操作", {
      action: {
        label: "去登录",
        onClick: () => {
          window.location.href = "/login?callbackUrl=/app";
        },
      },
    });
    return true;
  }
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeAgent, setActiveAgent] = useState<AgentKind>("ANALYST");
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<Set<string>>(new Set());

  // 对 QUEUED/RUNNING 的任务做轮询
  useEffect(() => {
    const pending = tasks.filter(
      (t) => t.status === "QUEUED" || t.status === "RUNNING",
    );
    if (pending.length === 0) return;

    const newOnes = pending.filter((t) => !pollingRef.current.has(t.id));
    newOnes.forEach((t) => pollingRef.current.add(t.id));

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        pending.map(async (t) => {
          const res = await fetch(
            `/api/workspaces/${workspaceId}/agent-tasks/${t.id}`,
            { cache: "no-store" },
          );
          if (!res.ok) return null;
          const json = await res.json();
          return json.ok ? (json.data.task as Task) : null;
        }),
      );

      let hasTerminal = false;
      setTasks((prev) =>
        prev.map((t) => {
          const upd = updates.find((u) => u && u.id === t.id);
          if (!upd) return t;
          if (upd.status === "DONE" || upd.status === "FAILED") {
            hasTerminal = true;
            pollingRef.current.delete(t.id);
          }
          return upd;
        }),
      );

      if (hasTerminal) router.refresh();
    }, 2500);

    return () => clearInterval(interval);
  }, [tasks, workspaceId, router]);

  async function submit() {
    if (!input.trim() || submitting) return;
    if (gateGuest()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/agent-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: activeAgent, input: input.trim() }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      setError(json?.error?.message || "派发失败");
      return;
    }
    setTasks((prev) => [json.data.task, ...prev]);
    setInput("");
  }

  const activeMeta = agents.find((a) => a.kind === activeAgent)!;
  const tone = toneMap[activeMeta.tone as keyof typeof toneMap];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap gap-2">
          {agents.map((a) => {
            const t = toneMap[a.tone as keyof typeof toneMap];
            const active = a.kind === activeAgent;
            return (
              <button
                key={a.kind}
                onClick={() => setActiveAgent(a.kind)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? `bg-gradient-to-br ${t.btn} text-white shadow-sm`
                    : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <a.icon className="h-3.5 w-3.5" />
                {a.name}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder={activeMeta.placeholder}
            className="flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <button
            onClick={submit}
            disabled={submitting || !input.trim()}
            className={`inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-lg bg-gradient-to-br ${tone.btn} px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity`}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            派发
          </button>
        </div>
        <div className="mt-2 text-[11px] text-zinc-400">
          按 ⌘/Ctrl + Enter 直接派发 · 真实 LLM / fal 调用约 5-60s，期间自动轮询
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500">
            还没有任务，试试上面的输入框吧。
          </div>
        ) : (
          tasks.map((t) => {
            const meta = agents.find((a) => a.kind === t.agent)!;
            const tone = toneMap[meta.tone as keyof typeof toneMap];
            return (
              <div key={t.id} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.chip}`}>
                    <meta.icon className="h-3 w-3" />
                    {meta.name}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                    <StatusChip status={t.status} />
                    {t.costCents != null && t.costCents > 0 && (
                      <span title={t.model ?? undefined}>
                        ¢{t.costCents.toFixed(0)}
                      </span>
                    )}
                    <span>{new Date(t.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                </div>
                <div className="mt-3 text-sm text-zinc-800">{t.input}</div>
                {t.status === "RUNNING" || t.status === "QUEUED" ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-3 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t.status === "QUEUED" ? "等待调度…" : "Agent 正在工作，自动轮询中…"}
                  </div>
                ) : t.output ? (
                  <pre className="mt-3 rounded-lg bg-zinc-50/80 px-3 py-3 text-xs text-zinc-700 whitespace-pre-wrap font-mono leading-relaxed">
                    {t.output}
                  </pre>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: TaskStatus }) {
  const map = {
    QUEUED: { cls: "bg-zinc-100 text-zinc-600", icon: CircleDashed, label: "排队" },
    RUNNING: { cls: "bg-amber-50 text-amber-700", icon: Loader2, label: "运行" },
    DONE: { cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2, label: "完成" },
    FAILED: { cls: "bg-rose-50 text-rose-700", icon: XCircle, label: "失败" },
  } as const;
  const it = map[status];
  const Icon = it.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${it.cls}`}
    >
      <Icon
        className={`h-3 w-3 ${status === "RUNNING" ? "animate-spin" : ""}`}
      />
      {it.label}
    </span>
  );
}
