'use client';

import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface Verdict {
  verdict: '推荐' | '谨慎' | '不推荐';
  score: number;
  reasons: string[];
  risks: string[];
  beginnerTip: string;
}

const STYLES = {
  推荐: { icon: CheckCircle2, ring: 'border-green-300 dark:border-green-800', badge: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  谨慎: { icon: AlertTriangle, ring: 'border-amber-300 dark:border-amber-800', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  不推荐: { icon: XCircle, ring: 'border-red-300 dark:border-red-800', badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
} as const;

export function AIVerdict({ productId, region }: { productId: string; region: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Verdict | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/product-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, region }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'AI 诊断失败');
      setData(json.data as Verdict);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 诊断失败');
    } finally {
      setLoading(false);
    }
  }

  const style = data ? STYLES[data.verdict] : null;
  const Icon = style?.icon;

  return (
    <div className={`rounded-xl border ${style ? style.ring : 'border-zinc-200 dark:border-zinc-800'} bg-white dark:bg-zinc-950 p-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold">AI 选品诊断</h2>
        </div>
        {!data && (
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {loading ? '诊断中…' : '生成诊断'}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {data && Icon && style && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${style.badge}`}>
              <Icon size={15} />
              {data.verdict}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">新手友好度</span>
              <span className="text-lg font-bold">{data.score}</span>
              <span className="text-xs text-zinc-400">/100</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 mb-1.5">✅ 利好</h3>
              <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                {data.reasons.map((r, i) => <li key={i}>· {r}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 mb-1.5">⚠️ 风险</h3>
              <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                {data.risks.map((r, i) => <li key={i}>· {r}</li>)}
              </ul>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
            💡 <span className="font-medium">新手建议:</span> {data.beginnerTip}
          </div>
        </div>
      )}
    </div>
  );
}
