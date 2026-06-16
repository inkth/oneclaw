"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  X,
  Loader2,
  Sparkles,
  TrendingUp,
  Wrench,
  Plus,
  Copy,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type Tone = "brand" | "amber" | "emerald";

type Proposal = {
  name: string;
  emoji: string;
  engine: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: "UNBOXING" | "COMPARISON" | "SCENE" | "BEFORE_AFTER";
  promptTemplate: string;
  rationale: string;
};

type Improvement = {
  templateId: string;
  issue: string;
  suggestedPrompt: string;
  rationale?: string;
};

type TopPerformer = {
  templateId: string;
  score: number;
  reason: string;
};

type OptimizerOutput = {
  summary: string;
  topPerformers: TopPerformer[];
  improvements: Improvement[];
  newProposals: Proposal[];
  templatesAnalyzed: number;
  videosAnalyzed: number;
};

type Task = {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  errorMessage?: string | null;
  metadata?: OptimizerOutput | null;
  output?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costCents?: number | null;
  model?: string | null;
};

type TemplateLite = { id: string; name: string; emoji: string | null };

export function TemplateOptimizerModal({
  workspaceId,
  templates,
  onClose,
  onTemplateCreated,
}: {
  workspaceId: string;
  templates: TemplateLite[];
  onClose: () => void;
  onTemplateCreated: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"top" | "improve" | "new">("new");
  const [creatingProposalIdx, setCreatingProposalIdx] = useState<number | null>(null);

  // Kick off the task on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/v1/workspaces/${workspaceId}/templates/optimize`, {
        method: "POST",
      });
      const j = await r.json();
      if (cancelled) return;
      if (!r.ok || !j.ok) {
        setError(j.error?.message || "发送失败");
        return;
      }
      setTask(j.data.task);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Poll while QUEUED/RUNNING
  useEffect(() => {
    if (!task || task.status === "DONE" || task.status === "FAILED") return;
    const t = setInterval(async () => {
      const r = await fetch(
        `/api/v1/workspaces/${workspaceId}/agent-tasks/${task.id}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      if (j.ok) setTask(j.data.task as Task);
    }, 2500);
    return () => clearInterval(t);
  }, [task, workspaceId]);

  // ESC close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done = task?.status === "DONE";
  const failed = task?.status === "FAILED";
  const data = done ? task?.metadata : null;

  const templateName = (id: string) =>
    templates.find((t) => t.id === id)?.name ?? id.slice(0, 8);

  async function createFromProposal(p: Proposal, idx: number) {
    setCreatingProposalIdx(idx);
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        description: `AI 推荐 · ${p.rationale}`,
        emoji: p.emoji,
        engine: p.engine,
        durationSec: p.durationSec,
        aspectRatio: p.aspectRatio,
        style: p.style,
        promptTemplate: p.promptTemplate,
        generateScript: false,
        generateCover: true,
      }),
    });
    const json = await res.json();
    setCreatingProposalIdx(null);
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || "创建失败");
      return;
    }
    toast.success(`已创建模板：${p.name}`);
    onTemplateCreated();
  }

  function copyPrompt(prompt: string) {
    navigator.clipboard.writeText(prompt);
    toast.success("已复制 prompt");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold">AI 模板优化器</h2>
              <p className="text-2xs text-zinc-500">
                基于历史模板使用 + 视频成绩，让 LLM 推荐高效组合
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          {!error && !done && !failed && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              <div className="text-sm font-medium">DeepSeek 正在分析…</div>
              <div className="text-2xs text-zinc-500">
                {task?.status === "QUEUED" ? "排队中" : "运行中"} · 通常 10-20 秒
              </div>
            </div>
          )}

          {failed && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 p-4 text-sm text-rose-700">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                分析失败
              </div>
              <pre className="mt-2 text-2xs whitespace-pre-wrap font-mono">
                {task?.errorMessage ?? task?.output ?? "未知错误"}
              </pre>
            </div>
          )}

          {done && data && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand-200/80 bg-brand-50/40 p-4">
                <div className="text-2xs uppercase tracking-wider text-brand-600 font-semibold">
                  📌 总览
                </div>
                <p className="mt-1.5 text-sm text-zinc-800 leading-relaxed">
                  {data.summary}
                </p>
                <div className="mt-2 text-2xs text-zinc-500">
                  分析了 {data.templatesAnalyzed} 个模板 · {data.videosAnalyzed} 条视频
                  {task?.costCents != null && task.costCents > 0 && (
                    <> · 本次消耗 ¢{task.costCents}</>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1.5 border-b border-zinc-200">
                <TabBtn
                  active={tab === "new"}
                  onClick={() => setTab("new")}
                  icon={Sparkles}
                  count={data.newProposals.length}
                  tone="brand"
                  label="新模板提案"
                />
                <TabBtn
                  active={tab === "improve"}
                  onClick={() => setTab("improve")}
                  icon={Wrench}
                  count={data.improvements.length}
                  tone="amber"
                  label="优化建议"
                />
                <TabBtn
                  active={tab === "top"}
                  onClick={() => setTab("top")}
                  icon={TrendingUp}
                  count={data.topPerformers.length}
                  tone="emerald"
                  label="高效模板"
                />
              </div>

              {/* Tab content */}
              {tab === "new" && (
                <div className="space-y-2.5">
                  {data.newProposals.length === 0 ? (
                    <EmptyTab text="当前数据下没有新模板提案。多生成几条视频再来分析。" />
                  ) : (
                    data.newProposals.map((p, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-zinc-200/80 bg-white p-4 hover:border-brand-200 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="text-2xl leading-none flex-shrink-0">{p.emoji}</div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{p.name}</div>
                              <div className="mt-0.5 text-2xs text-zinc-500 flex flex-wrap gap-1">
                                <span className="rounded bg-zinc-100 px-1 font-mono">{p.engine}</span>
                                <span>{p.durationSec}s</span>
                                <span>{p.aspectRatio}</span>
                                <span>{p.style}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => createFromProposal(p, i)}
                            disabled={creatingProposalIdx === i}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-2xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 flex-shrink-0"
                          >
                            {creatingProposalIdx === i ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            一键创建
                          </button>
                        </div>
                        <pre className="mt-3 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2 text-2xs text-zinc-700 whitespace-pre-wrap font-sans leading-relaxed">
                          {p.promptTemplate}
                        </pre>
                        <p className="mt-2 text-2xs text-zinc-500 leading-relaxed">
                          {p.rationale}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "improve" && (
                <div className="space-y-2.5">
                  {data.improvements.length === 0 ? (
                    <EmptyTab text="所有自建模板看起来都没什么明显短板。" />
                  ) : (
                    data.improvements.map((imp, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">
                            {templateName(imp.templateId)}
                          </div>
                          <button
                            onClick={() => copyPrompt(imp.suggestedPrompt)}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-2xs font-medium text-amber-800 hover:bg-amber-200"
                          >
                            <Copy className="h-3 w-3" />
                            复制新 prompt
                          </button>
                        </div>
                        <div className="mt-2 text-2xs text-zinc-700">
                          <span className="font-medium text-amber-800">问题：</span>
                          {imp.issue}
                        </div>
                        <pre className="mt-2 rounded-lg bg-white border border-amber-200 px-3 py-2 text-2xs text-zinc-800 whitespace-pre-wrap font-sans leading-relaxed">
                          {imp.suggestedPrompt}
                        </pre>
                        {imp.rationale && (
                          <p className="mt-2 text-2xs text-zinc-500">
                            {imp.rationale}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "top" && (
                <div className="space-y-2">
                  {data.topPerformers.length === 0 ? (
                    <EmptyTab text="还没有足够的视频成绩数据。多用几个模板生成视频再来看。" />
                  ) : (
                    data.topPerformers.map((p) => (
                      <div
                        key={p.templateId}
                        className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 flex items-start gap-3"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 font-bold text-sm flex-shrink-0">
                          {p.score}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">
                            {templateName(p.templateId)}
                          </div>
                          <p className="mt-0.5 text-2xs text-zinc-600 leading-relaxed">
                            {p.reason}
                          </p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-1" />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TONE_TAB: Record<Tone, { active: string; idle: string }> = {
  brand: {
    active: "border-brand-500 text-brand-700",
    idle: "border-transparent text-zinc-500 hover:text-zinc-900",
  },
  amber: {
    active: "border-amber-500 text-amber-700",
    idle: "border-transparent text-zinc-500 hover:text-zinc-900",
  },
  emerald: {
    active: "border-emerald-500 text-emerald-700",
    idle: "border-transparent text-zinc-500 hover:text-zinc-900",
  },
};

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: Tone;
}) {
  const t = TONE_TAB[tone];
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active ? t.active : t.idle
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="rounded-full bg-zinc-100 px-1.5 text-2xs text-zinc-600">
        {count}
      </span>
    </button>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200/80 bg-white px-4 py-8 text-center text-xs text-zinc-500">
      {text}
    </div>
  );
}
