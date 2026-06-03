'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  TrendingUp,
  Users,
  Package,
  BarChart3,
  GraduationCap,
  Truck,
  FileText,
  Home,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/discovery', label: '智能选品', icon: Search },
  { href: '/influencers', label: '达人合作', icon: Users },
  { href: '/analytics', label: '数据看板', icon: BarChart3 },
  { href: '/sourcing', label: '货源对接', icon: Package, disabled: true },
  { href: '/listings', label: 'Listing 助手', icon: FileText, disabled: true },
  { href: '/fulfillment', label: '物流履约', icon: Truck, disabled: true },
  { href: '/learn', label: '知识学院', icon: GraduationCap, disabled: true },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col">
      <div className="px-4 py-5 border-b border-zinc-100 dark:border-zinc-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
            爪
          </div>
          <span className="text-lg font-semibold tracking-tight">OneClaw</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          const disabled = 'disabled' in item && item.disabled;

          if (disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
              >
                <Icon size={18} />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">Soon</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-[11px] text-zinc-400">OneClaw v0.1 · TikTok Shop</p>
      </div>
    </aside>
  );
}
