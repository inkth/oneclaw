"use client";

import { useState } from "react";
import { Menu, X, Sparkles, ArrowRight } from "lucide-react";

const navItems: Array<{ label: string; href: string; badge?: string }> = [
  { label: "数据洞察", href: "/#insights" },
  { label: "内容创作", href: "/#content" },
  { label: "Agent 团队", href: "/#agents" },
  { label: "定价", href: "/pricing" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 w-full glass border-b border-zinc-200/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <a href="#" className="flex items-center gap-2">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 via-violet-500 to-fuchsia-500 shadow-sm">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              One<span className="text-brand-600">Claw</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="relative px-3 py-2 text-sm font-medium text-zinc-700 hover:text-brand-600 transition-colors"
              >
                {item.label}
                {item.badge && (
                  <span className="absolute -top-0.5 -right-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-2xs font-semibold text-white leading-none">
                    {item.badge}
                  </span>
                )}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <a
              href="/login"
              className="px-3 py-2 text-sm font-medium text-zinc-700 hover:text-brand-600 transition-colors"
            >
              登录
            </a>
            <a
              href="/app/create"
              className="group relative inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-all shadow-sm hover:shadow-md"
            >
              开始体验
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <button
            className="md:hidden p-2 text-zinc-700"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t border-zinc-200/60 py-3">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="block px-3 py-2 text-sm font-medium text-zinc-700"
              >
                {item.label}
                {item.badge && (
                  <span className="ml-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-2xs font-semibold text-white">
                    {item.badge}
                  </span>
                )}
              </a>
            ))}
            <div className="flex gap-2 px-3 py-3 border-t border-zinc-200/60 mt-2">
              <a href="/login" className="flex-1 text-center rounded-full border border-zinc-300 py-2 text-sm font-medium">
                登录
              </a>
              <a href="/app/create" className="flex-1 text-center rounded-full bg-zinc-900 py-2 text-sm font-medium text-white">
                开始体验
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
