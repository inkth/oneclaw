"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  AGENT_IDENTITY,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type AgentKey,
} from "@/lib/ui/tokens";
import { type ReviewResult } from "@/lib/review/types";
import { ReviewResults } from "./review-panel";

export type StreamTask = {
  id: string;
  agent: string;
  status: string;
  input: string;
  output?: string | null;
  errorMessage?: string | null;
  metadata?: {
    steps?: { key: string; label: string; status: string }[];
    /** REVIEW 任务:完整复盘结果,流内还原仪表盘。 */
    review?: ReviewResult;
  } | null;
  createdAt: string;
};

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);

const OUTPUT_COLLAPSE_LIMIT = 600;

/**
 * 会话流:每次派活 = 右侧用户气泡(指令)+ 左侧 Agent 气泡(状态/结果)。
 * 新任务在最上方紧贴输入框,执行中实时显示进度,完成后结果就地展开;
 * 所有 Agent 统一落任务表,复盘(REVIEW)从 metadata.review 还原仪表盘。
 */
export function TaskStream({
  items,
  limit,
  moreHref,
}: {
  items: StreamTask[];
  /** 仅展示最近 N 条,溢出时显示「查看全部」链接(工作台首页用)。 */
  limit?: number;
  moreHref?: string;
}) {
  if (items.length === 0) return null;
  const visible = limit ? items.slice(0, limit) : items;
  const overflow = limit ? items.length - visible.length : 0;

  return (
    <div className="space-y-5">
      {visible.map((task, i) => (
        <TaskBubble key={task.id} task={task} newest={i === 0} />
      ))}
      {overflow > 0 && moreHref && (
        <div className="text-center">
          <Link
            href={moreHref}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-ink"
          >
            查看全部 {items.length} 条任务 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1c1d1f] px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
        {children}
      </div>
    </div>
  );
}

function AgentBubble({
  agent,
  status,
  children,
}: {
  agent: string;
  status?: string;
  children: React.ReactNode;
}) {
  const identity = AGENT_IDENTITY[agent as AgentKey];
  const Icon = identity?.icon ?? Bot;
  return (
    <div className="flex justify-start">
      <div className="dk-card max-w-[92%] min-w-0 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
            <Icon className="h-3 w-3" />
          </span>
          <span className="text-xs font-semibold text-ink">{identity?.label ?? agent}</span>
          {status && (
            <Badge tone={TASK_STATUS_TONE[status] ?? "neutral"}>
              {TASK_STATUS_LABEL[status] ?? status}
            </Badge>
          )}
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

/** TEAM 任务的接力进度:metadata.steps 渲染为 ✓ / 转圈 / ✗ 一行。 */
function TeamSteps({ steps }: { steps: { key: string; label: string; status: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-zinc-300">→</span>}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${
              s.status === "DONE"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : s.status === "RUNNING"
                  ? "border-amber-100 bg-amber-50 text-amber-700"
                  : s.status === "FAILED"
                    ? "border-rose-100 bg-rose-50 text-rose-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-400"
            }`}
          >
            {s.status === "DONE" ? (
              <Check className="h-3 w-3" />
            ) : s.status === "RUNNING" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : s.status === "FAILED" ? (
              <X className="h-3 w-3" />
            ) : null}
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function TaskBubble({ task, newest = false }: { task: StreamTask; newest?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const review = task.agent === "REVIEW" ? task.metadata?.review : undefined;
  // 最新一条复盘默认展开仪表盘(刚提交完就要看结果),历史折叠省空间。
  const [dashOpen, setDashOpen] = useState(newest);
  const active = ACTIVE_STATUSES.has(task.status);
  const output = task.output ?? "";
  const long = output.length > OUTPUT_COLLAPSE_LIMIT;
  const shown = !long || expanded ? output : output.slice(0, OUTPUT_COLLAPSE_LIMIT) + "…";
  const steps = task.metadata?.steps;

  return (
    <div className="space-y-2">
      <UserBubble>{task.input}</UserBubble>
      <AgentBubble agent={task.agent} status={task.status}>
        {Array.isArray(steps) && steps.length > 0 && <TeamSteps steps={steps} />}
        {active ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {task.status === "QUEUED" ? "排队中,马上开始…" : "正在工作,结果会出现在这里…"}
          </div>
        ) : task.status === "FAILED" ? (
          <div className="text-sm leading-relaxed text-rose-600">
            {task.errorMessage || "执行失败,请稍后重试"}
          </div>
        ) : (
          <>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
              {shown || "(无输出)"}
            </div>
            {long && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 text-xs font-medium text-zinc-500 hover:text-ink"
              >
                {expanded ? "收起" : "展开全部"}
              </button>
            )}
            {review && (
              <button
                onClick={() => setDashOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink"
              >
                {dashOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {dashOpen ? "收起仪表盘" : "展开复盘仪表盘"}
              </button>
            )}
          </>
        )}
      </AgentBubble>
      {review && dashOpen && (
        <div className="pt-1">
          <ReviewResults result={review} />
        </div>
      )}
    </div>
  );
}
