"use client";

import { useEffect, useRef, useState } from "react";
import { AgentComposer, AgentPills, type ComposerKind } from "./agent-composer";
import { QuickActionCards, type QuickAction } from "./quick-actions";
import { TaskStream, type StreamTask } from "./task-stream";
import { industryPresets } from "@/components/OnboardingCard";

const POLL_MS = 5000;

/**
 * 会话流工作台:胶囊行 + 超大输入卡 + 任务消息流 + 快捷功能卡。
 * 派活后新任务气泡立即出现在输入框下方;存在排队/执行中的任务时每 5s 轮询刷新,
 * 结果(含复盘仪表盘)就地展开在流里,不再依赖静态任务列表。
 */
export function Workbench({
  workspaceId,
  isGuest = false,
  showPresets = false,
  initialTasks = [],
  streamLimit,
}: {
  workspaceId: string;
  isGuest?: boolean;
  /** 新工作台(无任何数据)时展示品类预设 chips。 */
  showPresets?: boolean;
  /** 服务端预取的任务历史(新→旧),作为会话流初始内容。 */
  initialTasks?: StreamTask[];
  /** 流最多展示几条,溢出显示「查看全部」(首页传,全量页不传)。 */
  streamLimit?: number;
}) {
  const [activeAgent, setActiveAgent] = useState<ComposerKind>("ANALYST");
  const [input, setInput] = useState("");
  // 所有 Agent(含同步复盘)统一落任务表,流就是任务列表。
  const [tasks, setTasks] = useState<StreamTask[]>(initialTasks);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 有排队/执行中的任务时轮询,全部到达终态自动停。
  const hasActive = tasks.some((t) => t.status === "QUEUED" || t.status === "RUNNING");
  useEffect(() => {
    if (!hasActive || !workspaceId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/agent-tasks`);
        const json = await res.json().catch(() => null);
        const fresh = (json?.data?.tasks ?? json?.tasks) as StreamTask[] | undefined;
        if (res.ok && json?.ok && Array.isArray(fresh)) setTasks(fresh);
      } catch {
        // 网络抖动忽略,下个周期重试
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasActive, workspaceId]);

  function focusInput(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      // 模板带「」占位时光标落在括号内,否则落到末尾
      const pos = text.indexOf("「」");
      const cursor = pos >= 0 ? pos + 1 : text.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function pickQuickAction(a: QuickAction) {
    if (a.agent) setActiveAgent(a.agent);
    if (a.promptTemplate) focusInput(a.promptTemplate);
  }

  function pickPreset(prompt: string) {
    setActiveAgent("ANALYST");
    focusInput(prompt);
  }


  return (
    <div className="space-y-6">
      <AgentPills active={activeAgent} onChange={setActiveAgent} />

      <div className="relative">
        <div
          aria-hidden
          className="dk-aura pointer-events-none absolute -inset-x-8 -top-6 bottom-0 -z-10"
        />
        <AgentComposer
          workspaceId={workspaceId}
          isGuest={isGuest}
          activeAgent={activeAgent}
          onAgentChange={setActiveAgent}
          input={input}
          onInputChange={setInput}
          textareaRef={textareaRef}
          onDispatched={(task) => setTasks((prev) => [task, ...prev])}
        />
      </div>

      <TaskStream items={tasks} limit={streamLimit} moreHref="/app/agents" />

      <QuickActionCards onPick={pickQuickAction} />

      {showPresets && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-zinc-400">不知道从哪开始?选个品类试试:</span>
          {industryPresets.map((p) => (
            <button
              key={p.label}
              onClick={() => pickPreset(p.prompt)}
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-black/20 hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
