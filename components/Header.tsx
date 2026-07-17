"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { BrandLockup } from "@/components/ui/BrandMark";

const navItems: Array<{ label: string; href: string; badge?: string }> = [
  { label: "怎么用", href: "/intro#chain" },
  { label: "认识 Agent", href: "/intro#team" },
  { label: "定价", href: "/pricing" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/[0.06] bg-[#f7f6f2]/88 backdrop-blur-2xl">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between sm:h-[68px]">
          <Link href="/intro" aria-label="发现猫首页" className="rounded-xl">
            <BrandLockup tileClassName="h-8 w-8 rounded-[10px]" />
          </Link>

          <nav aria-label="主导航" className="hidden items-center gap-0.5 rounded-full border border-black/[0.06] bg-white/58 p-1 shadow-[0_1px_2px_rgba(18,20,25,.03)] md:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="relative rounded-full px-4 py-2 text-[13px] font-semibold text-zinc-600 transition-[background-color,color,box-shadow] hover:bg-white hover:text-ink hover:shadow-sm"
              >
                {item.label}
                {item.badge && (
                  <span className="absolute -top-0.5 -right-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-2xs font-semibold text-white leading-none">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-1 md:flex">
            <Link
              href="/login"
              className="rounded-full px-3.5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[0.035] hover:text-ink"
            >
              登录
            </Link>
            <Link
              href="/app"
              className="pop group relative inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-brand)] hover:bg-brand-700"
            >
              进入工作台
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5 md:hidden">
            <Link
              href="/app"
              className="rounded-full bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--shadow-brand)]"
            >
              免费体验
            </Link>
            <button
              type="button"
              className="rounded-full p-2 text-zinc-700 transition-colors hover:bg-black/[0.05]"
              onClick={() => setOpen(!open)}
              aria-label={open ? "关闭菜单" : "打开菜单"}
              aria-expanded={open}
              aria-controls="mobile-nav"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div id="mobile-nav" className="absolute inset-x-4 top-[62px] rounded-[22px] border border-black/[0.08] bg-white/96 p-2 shadow-[0_24px_60px_-24px_rgba(18,20,25,.3)] backdrop-blur-2xl sm:top-[66px] md:hidden">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-ink"
              >
                {item.label}
                {item.badge && (
                  <span className="ml-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-2xs font-semibold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 border-t border-zinc-200/70 px-2 pb-1 pt-3">
              <Link href="/login" onClick={() => setOpen(false)} className="flex-1 rounded-full border border-zinc-200 py-2.5 text-center text-sm font-medium text-zinc-700">
                登录
              </Link>
              <Link href="/app" onClick={() => setOpen(false)} className="flex-1 rounded-full bg-brand-600 py-2.5 text-center text-sm font-semibold text-white">
                进入工作台
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
