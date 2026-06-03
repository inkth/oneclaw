'use client';

import { Sparkles } from 'lucide-react';

const PROMPTS = [
  '帮我分析下美区适合新手的选品方向',
  '第一个月预算 5000 元,该怎么起步?',
  'TikTok Shop 选品要避开哪些坑?',
];

/** Opens the global Copilot (mounted in the dashboard layout) with a prefilled
 *  question via the shared `oneclaw:copilot` window event. */
export function CopilotPrompts() {
  function ask(q: string) {
    window.dispatchEvent(new CustomEvent('oneclaw:copilot', { detail: q }));
  }

  return (
    <div className="rounded-2xl border border-orange-200/60 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 to-pink-50 dark:from-orange-950/30 dark:to-pink-950/20 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-orange-500" />
        <h2 className="text-sm font-semibold">问问 AI 经营助手</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => ask(p)}
            className="rounded-full border border-orange-200 dark:border-orange-900/50 bg-white/70 dark:bg-zinc-950/50 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-900 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
