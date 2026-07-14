"use client";

import { useState } from "react";
import { Send, Check, Loader2 } from "lucide-react";

export function SubscribeForm({ source = "landing-footer" }: { source?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "loading") return;
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    setState("loading");
    setMessage(null);
    const res = await fetch("/api/v1/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setState("error");
      setMessage(json?.error?.message || "订阅失败，稍后再试");
      return;
    }
    setState("done");
    setMessage("已加入订阅，下周一见");
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
        <Check className="h-4 w-4" />
        {message}
      </div>
    );
  }

  return (
    <form
      className="flex w-full sm:w-auto items-center gap-2"
      onSubmit={onSubmit}
    >
      <input
        name="email"
        type="email"
        required
        placeholder="your@email.com"
        className="w-full rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/35 focus:ring-2 focus:ring-brand-300/30 sm:w-64"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-400 disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        订阅
      </button>
      {state === "error" && message && (
        <span className="text-xs text-rose-600">{message}</span>
      )}
    </form>
  );
}
