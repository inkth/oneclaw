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
        className="w-full sm:w-64 rounded-full border border-zinc-200 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--dk-btn-black)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dk-btn-black-hover)] disabled:opacity-60 transition-colors"
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
