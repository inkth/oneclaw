"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Video, Globe } from "lucide-react";

type AgentKind = "ANALYST" | "DIRECTOR" | "OPERATOR";

const config = {
  ANALYST: { label: "重新分析", icon: Video },
  DIRECTOR: { label: "派给创意总监", icon: Video },
  OPERATOR: { label: "排给运营官", icon: Globe },
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
    router.push("/app");
  }

  const sizeCls =
    size === "xs"
      ? "px-2 py-1 text-2xs"
      : "px-3 py-1.5 text-2xs";

  return (
    <div className={className}>
      <button
        onClick={dispatch}
        disabled={busy}
        className={`inline-flex items-center gap-1 rounded-full bg-zinc-900 ${sizeCls} font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors`}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Icon className="h-3 w-3" />
        )}
        {meta.label}
      </button>
      {err && <div className="mt-1 text-2xs text-rose-600">{err}</div>}
    </div>
  );
}
