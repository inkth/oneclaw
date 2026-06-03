'use client';

import { useState } from 'react';
import { Clapperboard, Loader2, Copy, Check } from 'lucide-react';

type Format = 'short_video' | 'live_talking_points';

export function AIScript({ productId, region }: { productId: string; region: string }) {
  const [format, setFormat] = useState<Format>('short_video');
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setStreaming(true);
    setError(null);
    setText('');
    try {
      const res = await fetch('/api/ai/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, region, format }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'AI 生成失败' }));
        throw new Error(err.error ?? 'AI 生成失败');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setText(acc);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 生成失败');
    } finally {
      setStreaming(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clapperboard size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold">AI 内容脚本</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={format}
            onChange={e => setFormat(e.target.value as Format)}
            disabled={streaming}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1.5 text-xs"
          >
            <option value="short_video">短视频脚本</option>
            <option value="live_talking_points">直播话术</option>
          </select>
          <button
            onClick={run}
            disabled={streaming}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-white disabled:opacity-50"
          >
            {streaming ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />}
            {streaming ? '生成中…' : text ? '重新生成' : '生成脚本'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {text && (
        <div className="mt-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 p-4 relative">
          <button
            onClick={copy}
            className="absolute top-3 right-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? '已复制' : '复制'}
          </button>
          <pre className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed pr-12">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}
