"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, MessagesSquare, Pencil, Trash2, Check, X } from "lucide-react";
import { authFetch } from "@/lib/api-browser";
import { AGENT_IDENTITY, type AgentKey } from "@/lib/ui/tokens";

// 会话列表面板只在「会话」板块出现(/app/agents 及其子路由)。
// 其它板块(工作台/选品/资产/服务)返回 null,侧栏布局不变。
const VISIBLE_PREFIX = "/app/agents";

export type Conversation = {
  id: string;
  title: string;
  lastAgent?: string;
  createdAt: string;
  updatedAt: string;
};

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

// 从 /app/agents/{cid} 取当前会话 ID;/app/agents 与 /app/agents/new 无激活项。
function activeCid(pathname: string): string | null {
  const m = pathname.match(/^\/app\/agents\/([^/]+)$/);
  if (!m || m[1] === "new") return null;
  return m[1];
}

/** 左侧会话列表:每条会话一项,点击进入该会话;hover 可重命名/删除。
 *  数据走 /conversations,样式复用 AGENT_IDENTITY,与会话流口径一致。 */
export function ConversationRail({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const visible = pathname.startsWith(VISIBLE_PREFIX);
  const current = activeCid(pathname);

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // 进入/切换会话页时刷新列表,新建会话路由后也随之更新(pathname 变化触发)。
  useEffect(() => {
    if (!visible || !workspaceId) return;
    let alive = true;
    authFetch(`/api/v1/workspaces/${workspaceId}/conversations`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        const fresh = (json?.data?.conversations ?? json?.conversations) as
          | Conversation[]
          | undefined;
        if (Array.isArray(fresh)) setConvs(fresh);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [visible, workspaceId, pathname]);

  if (!visible) return null;

  function startEdit(c: Conversation) {
    setEditingId(c.id);
    setDraft(c.title);
  }

  async function saveEdit(id: string) {
    const title = draft.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    setBusyId(id);
    try {
      const res = await authFetch(`/api/v1/workspaces/${workspaceId}/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "重命名失败");
      setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
    } finally {
      setBusyId(null);
      setEditingId(null);
    }
  }

  async function remove(c: Conversation) {
    if (!window.confirm(`删除会话「${c.title}」?该会话的对话记录会一并清除(已生成的视频/选品不受影响)。`))
      return;
    setBusyId(c.id);
    try {
      const res = await authFetch(`/api/v1/workspaces/${workspaceId}/conversations/${c.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "删除失败");
      setConvs((prev) => prev.filter((x) => x.id !== c.id));
      // 删的是当前会话则退回落地(自动转最近一条或新对话)。
      if (current === c.id) router.push("/app/agents");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-56 shrink-0 flex-col self-start border-r border-[var(--dk-stroke-border)] bg-transparent">
      <div className="flex items-center justify-between px-3 py-4">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <MessagesSquare className="h-4 w-4 text-brand-500" /> 对话
        </span>
        <Link
          href="/app/agents/new"
          className="press inline-flex items-center gap-1 rounded-full border border-[var(--dk-stroke-border)] bg-white px-2.5 py-1 text-2xs font-medium text-zinc-600 transition-colors hover:bg-[var(--dk-action-regular)] hover:text-zinc-900"
        >
          <Plus className="h-3 w-3" /> 新对话
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {!workspaceId ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-zinc-400">
            登录后，你的每段会话都会列在这里。
          </p>
        ) : !loaded ? (
          <p className="px-2 py-6 text-xs text-zinc-400">加载中…</p>
        ) : convs.length === 0 ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-zinc-400">
            还没有会话。点「新对话」派个活,这里就会出现。
          </p>
        ) : (
          <ul className="space-y-0.5">
            {convs.map((c) => {
              const identity = AGENT_IDENTITY[c.lastAgent as AgentKey];
              const Icon = identity?.icon ?? MessagesSquare;
              const isActive = current === c.id;
              const isEditing = editingId === c.id;
              const isBusy = busyId === c.id;

              if (isEditing) {
                return (
                  <li key={c.id} className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(c.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-brand-300 bg-white px-1.5 py-1 text-xs text-ink outline-none focus:border-brand-400"
                      />
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={isBusy}
                        className="press rounded p-1 text-brand-600 hover:bg-[var(--dk-action-regular)]"
                        aria-label="保存"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="press rounded p-1 text-zinc-400 hover:bg-[var(--dk-action-regular)]"
                        aria-label="取消"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={c.id} className="group/item relative">
                  <Link
                    href={`/app/agents/${c.id}`}
                    className={`block rounded-xl px-2 py-2 pr-12 transition-colors ${
                      isActive ? "bg-[var(--dk-action-regular)]" : "hover:bg-[var(--dk-action-regular)]"
                    } ${isBusy ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon
                        className={`h-3 w-3 shrink-0 ${isActive ? "text-brand-500" : "text-zinc-400"}`}
                      />
                      <span
                        className={`truncate text-xs font-medium ${
                          isActive ? "text-brand-700" : "text-zinc-900 group-hover/item:text-ink"
                        }`}
                      >
                        {c.title}
                      </span>
                    </div>
                    <div className="mt-0.5 pl-[18px] text-2xs text-zinc-400">
                      {identity?.label ?? "对话"} · {relTime(c.updatedAt)}
                    </div>
                  </Link>

                  {/* hover 操作:重命名 / 删除,绝对定位不挤压标题 */}
                  <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                    <button
                      onClick={() => startEdit(c)}
                      className="press rounded p-1 text-zinc-400 hover:bg-[var(--dk-action-regular)] hover:text-zinc-600"
                      aria-label="重命名"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => remove(c)}
                      className="press rounded p-1 text-zinc-400 hover:bg-[var(--dk-action-regular)] hover:text-red-500"
                      aria-label="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
