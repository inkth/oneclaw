"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, MessagesSquare } from "lucide-react";
import { AGENT_IDENTITY, type AgentKey } from "@/lib/ui/tokens";
import { type StreamTask } from "./task-stream";

// 会话列表面板只在「会话」板块出现(/app/agents)，作为该板块的左侧窄列表。
// 其它板块(工作台/选品/资产/服务)返回 null，侧栏布局不变。
const VISIBLE_PATHS = ["/app/agents"];

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function titleOf(input: string): string {
  const s = input.replace(/\s+/g, " ").trim();
  if (!s) return "(无指令)";
  return s.length > 36 ? s.slice(0, 36) + "…" : s;
}

/** 左侧会话列表:每条派活(agent_task)一项,点击跳到「全部对话」并定位到该条。
 *  数据复用 /agent-tasks,样式复用 AGENT_IDENTITY,与会话流口径一致。 */
export function ConversationRail({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const visible = VISIBLE_PATHS.includes(pathname);
  const [tasks, setTasks] = useState<StreamTask[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!visible || !workspaceId) return;
    let alive = true;
    fetch(`/api/v1/workspaces/${workspaceId}/agent-tasks`, { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        const fresh = (json?.data?.tasks ?? json?.tasks) as StreamTask[] | undefined;
        if (Array.isArray(fresh)) setTasks(fresh);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [visible, workspaceId, pathname]);

  if (!visible) return null;

  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-56 shrink-0 flex-col self-start border-r border-black/5 bg-transparent">
      <div className="flex items-center justify-between px-3 py-4">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <MessagesSquare className="h-4 w-4 text-brand-500" /> 对话
        </span>
        <Link
          href="/app"
          className="press inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-2xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <Plus className="h-3 w-3" /> 新对话
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {!workspaceId ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-zinc-400">
            登录后，你派的活与 AI 的全部对话会列在这里。
          </p>
        ) : !loaded ? (
          <p className="px-2 py-6 text-xs text-zinc-400">加载中…</p>
        ) : tasks.length === 0 ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-zinc-400">
            还没有对话。去工作台派个活，这里就会出现。
          </p>
        ) : (
          <ul className="space-y-0.5">
            {tasks.map((t) => {
              const identity = AGENT_IDENTITY[t.agent as AgentKey];
              const Icon = identity?.icon ?? MessagesSquare;
              return (
                <li key={t.id}>
                  <Link
                    href={`/app/agents#task-${t.id}`}
                    className="group block rounded-lg px-2 py-2 transition-colors hover:bg-black/[0.04]"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3 shrink-0 text-zinc-400" />
                      <span className="truncate text-xs font-medium text-zinc-700 group-hover:text-ink">
                        {titleOf(t.input)}
                      </span>
                    </div>
                    <div className="mt-0.5 pl-[18px] text-2xs text-zinc-400">
                      {identity?.label ?? t.agent} · {relTime(t.createdAt)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
