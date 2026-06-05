"use client";

import Link from "next/link";
import { Sparkles, ArrowRight, X } from "lucide-react";

/** 游客触发需要账号的动作时弹出的登录引导。callbackUrl 决定登录后回到哪。 */
export function LoginPromptModal({
  onClose,
  callbackUrl = "/app/create",
  title = "登录后继续",
  desc = "登录回来会回到这里，继续刚才的操作。",
}: {
  onClose: () => void;
  callbackUrl?: string;
  title?: string;
  desc?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="p-6 space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{desc}</p>
          </div>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
          >
            登录 / 注册
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={onClose}
            className="w-full text-xs text-zinc-400 hover:text-zinc-600"
          >
            再逛逛
          </button>
        </div>
      </div>
    </div>
  );
}
