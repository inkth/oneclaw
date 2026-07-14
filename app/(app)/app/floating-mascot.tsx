"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ListTodo, Sparkles, X } from "lucide-react";
import styles from "./floating-mascot.module.css";

function DiscoveryCat({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 120 132"
      role="img"
      aria-label="发现猫吉祥物"
      className={`${styles.mascot} h-full w-full overflow-visible ${open ? styles.open : ""}`}
    >
      <defs>
        <linearGradient id="discovery-cat-body" x1="27" y1="21" x2="91" y2="117" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff7954" />
          <stop offset="1" stopColor="#ed3f1d" />
        </linearGradient>
        <filter id="discovery-cat-shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#5b1c0f" floodOpacity="0.22" />
        </filter>
      </defs>

      <ellipse cx="60" cy="121" rx="31" ry="6" fill="#121419" opacity="0.12" />
      <g filter="url(#discovery-cat-shadow)">
        <path
          className={styles.tail}
          d="M82 93c23 3 30-10 22-25"
          fill="none"
          stroke="#ffab3d"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path d="M42 103v13c0 5-4 8-9 8h-2c-3 0-5-2-5-5 0-4 3-7 7-7h2v-10" fill="#121419" />
        <path d="M78 103v13c0 5 4 8 9 8h2c3 0 5-2 5-5 0-4-3-7-7-7h-2v-10" fill="#121419" />
        <rect x="30" y="69" width="60" height="48" rx="24" fill="url(#discovery-cat-body)" />
        <path d="M41 91c7 5 31 5 38 0" fill="none" stroke="#fff4ef" strokeWidth="3.2" strokeLinecap="round" opacity="0.95" />
        <path d="M45 98c6 4 24 4 30 0" fill="none" stroke="#fff4ef" strokeWidth="3.2" strokeLinecap="round" opacity="0.8" />
        <path d="M50 105c5 3 15 3 20 0" fill="none" stroke="#fff4ef" strokeWidth="3.2" strokeLinecap="round" opacity="0.65" />

        <path
          d="M23 52c0-14 7-25 18-32L39 7c0-3 4-5 6-3l11 10c3-1 6-1 9 0L76 4c2-2 6 0 6 3l-2 13c11 7 18 18 18 32 0 22-15 35-38 35S23 74 23 52Z"
          fill="url(#discovery-cat-body)"
        />
        <path d="m43 12 8 8-12 6 4-14Z" fill="#121419" />
        <path d="m77 12-8 8 12 6-4-14Z" fill="#121419" />
        <path d="M34 52c0-14 11-24 26-24s26 10 26 24c0 16-10 25-26 25s-26-9-26-25Z" fill="#fffefa" />
        <path d="M34 48c1-11 8-18 18-20l8 10 8-10c10 2 17 9 18 20-8-4-17-6-26-6s-18 2-26 6Z" fill="#121419" />
        {open ? (
          <>
            <ellipse cx="49" cy="54" rx="3.2" ry="4.2" fill="#121419" />
            <ellipse cx="71" cy="54" rx="3.2" ry="4.2" fill="#121419" />
            <circle cx="50" cy="52.8" r="1" fill="white" />
            <circle cx="72" cy="52.8" r="1" fill="white" />
          </>
        ) : (
          <>
            <path d="M45 54c2 2 6 2 8 0" fill="none" stroke="#121419" strokeWidth="2.8" strokeLinecap="round" />
            <path d="M67 54c2 2 6 2 8 0" fill="none" stroke="#121419" strokeWidth="2.8" strokeLinecap="round" />
          </>
        )}
        <path d="m60 58-3 3h6l-3-3Z" fill="#ff5a36" />
        <path d="M60 61c0 4-3 6-7 6m7-6c0 4 3 6 7 6" fill="none" stroke="#121419" strokeWidth="2" strokeLinecap="round" />
        <circle cx="42" cy="63" r="4" fill="#ff7954" opacity="0.25" />
        <circle cx="78" cy="63" r="4" fill="#ff7954" opacity="0.25" />
      </g>
    </svg>
  );
}

export function FloatingMascot() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const open = openPath === pathname;

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPath(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPath(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function focusComposer() {
    setOpenPath(null);
    if (pathname !== "/app/agents/new") return;
    requestAnimationFrame(() => {
      const composer = document.querySelector<HTMLTextAreaElement>("#agent-composer");
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
      composer?.focus({ preventScroll: true });
    });
  }

  return (
    <div ref={rootRef} className="fixed bottom-[76px] right-3 z-50 md:bottom-5 md:right-6">
      {open && (
        <section
          className={`${styles.panel} absolute bottom-full right-0 mb-2 w-[min(292px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-black/10 bg-white shadow-xl`}
          aria-label="发现猫助手"
        >
          <div className="flex items-start gap-3 border-b border-black/[0.06] px-4 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Sparkles className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-ink">需要我帮你推进什么？</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">从派活开始，进度和结果会保存在对话中。</p>
            </div>
            <button
              type="button"
              onClick={() => setOpenPath(null)}
              className="-mr-1 -mt-1 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-ink"
              aria-label="关闭发现猫助手"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1.5 p-2">
            <Link
              href="/app/agents/new#agent-composer"
              onClick={focusComposer}
              className="group flex items-center gap-3 rounded-2xl bg-brand-50 px-3 py-3 text-left transition-colors hover:bg-brand-100"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">发起新任务</span>
                <span className="mt-0.5 block text-2xs text-zinc-500">新建对话，让 Agent 开始执行</span>
              </span>
              <ArrowRight className="h-4 w-4 text-brand-500 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <Link
              href="/app/agents"
              onClick={() => setOpenPath(null)}
              className="group flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-zinc-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-zinc-600 shadow-sm">
                <ListTodo className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">查看任务进度</span>
                <span className="mt-0.5 block text-2xs text-zinc-500">继续跟进正在进行的对话</span>
              </span>
              <ArrowRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpenPath(open ? null : pathname)}
        className="group relative block h-[76px] w-[70px] transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4 md:h-[98px] md:w-[90px]"
        aria-label={open ? "收起发现猫助手" : "打开发现猫助手"}
        aria-expanded={open}
      >
        <DiscoveryCat open={open} />
        <span className="absolute -left-2 top-0 hidden whitespace-nowrap rounded-full border border-black/10 bg-white px-2.5 py-1 text-2xs font-semibold text-zinc-600 opacity-0 shadow-sm transition-all group-hover:-translate-y-1 group-hover:opacity-100 md:block">
          问问发现猫
        </span>
      </button>
    </div>
  );
}
