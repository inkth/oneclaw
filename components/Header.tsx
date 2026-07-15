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
    <header className="sticky top-0 z-50 w-full border-b border-black/[0.07] bg-[#f7f6f2]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[72px] items-center justify-between">
          <Link href="/intro" aria-label="发现猫首页">
            <BrandLockup tileClassName="h-8 w-8 rounded-lg" />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-black/[0.07] bg-white/70 p-1 md:flex">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="relative rounded-full px-4 py-2 text-[13px] font-semibold text-zinc-600 transition-all hover:bg-white hover:text-ink hover:shadow-sm"
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
            <Link
              href="/login"
              className="px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-ink"
            >
              登录
            </Link>
            <Link
              href="/app"
              className="pop group relative inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-brand)] hover:bg-brand-600"
            >
              进入工作台
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5 md:hidden">
            <Link
              href="/app"
              className="rounded-full bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--shadow-brand)]"
            >
              免费体验
            </Link>
            <button
              className="p-2 text-zinc-700"
              onClick={() => setOpen(!open)}
              aria-label={open ? "关闭菜单" : "打开菜单"}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-black/[0.07] py-3 md:hidden">
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
              <a href="/app" className="flex-1 rounded-full bg-brand-500 py-2 text-center text-sm font-semibold text-white">
                进入工作台
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
