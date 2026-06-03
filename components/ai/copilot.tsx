'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  '美区 TikTok Shop 新手适合做哪些品类?',
  '怎么判断一个商品值不值得做?',
  '第一次找达人带货,私信该怎么写?',
];

/** Other components can open the Copilot with a prefilled question by
 *  dispatching `window.dispatchEvent(new CustomEvent('oneclaw:copilot', { detail: '...' }))`. */
export function Copilot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setOpen(true);
      if (detail) void send(detail);
    }
    window.addEventListener('oneclaw:copilot', onOpen);
    return () => window.removeEventListener('oneclaw:copilot', onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;

    const history = [...messages, { role: 'user' as const, content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context: { route: pathname } }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'AI 服务异常' }));
        throw new Error(err.error ?? 'AI 服务异常');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...history, { role: 'assistant', content: acc }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '出错了,请稍后再试';
      setMessages([...history, { role: 'assistant', content: `⚠️ ${msg}` }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="打开 AI 助手"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 px-4 py-3 text-white shadow-lg shadow-orange-500/30 hover:opacity-90 transition-opacity"
        >
          <Sparkles size={18} />
          <span className="text-sm font-medium">AI 助手</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[min(70vh,560px)] w-[min(92vw,400px)] flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl">
          <header className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-xs font-bold text-white">
                爪
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">AI 经营助手</div>
                <div className="text-[10px] text-zinc-400">TikTok Shop 出海 · DeepSeek</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭"
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X size={18} />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="text-sm text-zinc-500">
                <p className="mb-3">嗨 👋 我是你的 TikTok Shop 经营助手,问我任何选品、达人、运营问题。</p>
                <div className="space-y-2">
                  {STARTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 border-t border-zinc-100 dark:border-zinc-800 p-3"
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="输入问题…"
              className="flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 max-h-28"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="发送"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-white disabled:opacity-40"
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
