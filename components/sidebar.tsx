'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from '@/lib/nav';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col">
      <div className="px-4 py-5 border-b border-zinc-100 dark:border-zinc-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
            爪
          </div>
          <span className="text-lg font-semibold tracking-tight">OneClaw</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-3">
        {NAV_GROUPS.map(group => (
          <div key={group.title}>
            <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
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
                    {item.beta && (
                      <span className="ml-auto text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        Beta
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-[11px] text-zinc-400">OneClaw v0.1 · AI 驱动 TikTok Shop 出海</p>
      </div>
    </aside>
  );
}
