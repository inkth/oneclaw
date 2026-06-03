import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { NAV_GROUPS } from '@/lib/nav';
import { CopilotPrompts } from './copilot-prompts';
import { HotProducts, HotProductsSkeleton } from './hot-products';

const STEPS = [
  { n: 1, title: '选品', desc: '在热销榜挑商品,用 AI 诊断是否值得做', href: '/discovery' },
  { n: 2, title: '找达人', desc: '查看带货达人,AI 一键生成邀约文案', href: '/influencers' },
  { n: 3, title: '上架带货', desc: 'AI 写 Listing 与短视频脚本,开始出单', href: '/listings' },
];

// Module tiles = everything except the 驾驶舱 group itself.
const MODULE_ITEMS = NAV_GROUPS.filter(g => g.title !== '经营驾驶舱').flatMap(g => g.items);

export default function DashboardPage() {
  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">经营驾驶舱</h1>
        <p className="text-sm text-zinc-500 mt-1">
          AI 驱动的一站式 TikTok Shop 出海平台 · 从选品到出单的全链路
        </p>
      </header>

      {/* Beginner quickstart */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 mb-3">新手三步走</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {STEPS.map(s => (
            <Link
              key={s.n}
              href={s.href}
              className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-pink-500 text-xs font-bold text-white">
                  {s.n}
                </span>
                <span className="text-sm font-semibold">{s.title}</span>
                <ArrowRight size={14} className="ml-auto text-zinc-300 group-hover:text-orange-500 transition-colors" />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{s.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* AI Copilot starter strip */}
      <CopilotPrompts />

      {/* Module entry tiles */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 mb-3">全部功能板块</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {MODULE_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon size={18} className="text-zinc-500" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.beta && (
                    <span className="ml-auto text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                      Beta
                    </span>
                  )}
                </div>
                {item.desc && <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Hot products preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-500">美区热销预览</h2>
          <Link href="/discovery" className="text-xs text-zinc-500 hover:underline">
            进入选品 →
          </Link>
        </div>
        <Suspense fallback={<HotProductsSkeleton />}>
          <HotProducts />
        </Suspense>
      </section>
    </div>
  );
}
