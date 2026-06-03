"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Video, Globe } from "lucide-react";

type AgentKind = "ANALYST" | "DIRECTOR" | "OPERATOR";

const config = {
  ANALYST: { label: "重新分析", icon: Video, color: "indigo" },
  DIRECTOR: { label: "派给创意总监", icon: Video, color: "violet" },
  OPERATOR: { label: "排给运营官", icon: Globe, color: "fuchsia" },
} as const;

const colorClass = {
  indigo: "from-indigo-500 to-indigo-600",
  violet: "from-violet-500 to-violet-600",
  fuchsia: "from-fuchsia-500 to-fuchsia-600",
} as const;

export function DispatchButton({
  workspaceId,
  agent,
  input,
  size = "sm",
  className,
}: {
  workspaceId: string;
  agent: AgentKind;
  input: string;
  size?: "sm" | "xs";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meta = config[agent];
  const Icon = meta.icon;

  async function dispatch() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/agent-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, input }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setBusy(false);
      setErr(json?.error?.message || "派发失败");
      return;
    }
    router.push("/app/agents");
  }

  const sizeCls =
    size === "xs"
      ? "px-2 py-1 text-[10px]"
      : "px-3 py-1.5 text-[11px]";

  return (
    <div className={className}>
      <button
        onClick={dispatch}
        disabled={busy}
        className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-br ${colorClass[meta.color]} ${sizeCls} font-medium text-white shadow-sm hover:shadow disabled:opacity-50 transition-all`}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Icon className="h-3 w-3" />
        )}
        {meta.label}
      </button>
      {err && <div className="mt-1 text-[10px] text-rose-600">{err}</div>}
    </div>
  );
}
