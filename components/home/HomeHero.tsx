"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  FileText,
  Loader2,
  Send,
  TrendingUp,
  Video,
} from "lucide-react";
import { DkAura } from "@/components/ui/GradientBackground";
import { BRAND_SLOGAN_FOCUS, BRAND_SLOGAN_LEAD } from "@/lib/brand";

/* 首屏即产品：复刻工作台 composer 的「一句话派活」交互。
   占位文字打字机轮换三条真实指令，对应的 Agent pill 同步点亮，
   下方接一卡「Agent 接力实况」循环播放完整链路。 */

type DemoPrompt = {
  agent: string;
  kind: "ANALYST" | "DIRECTOR" | "LISTING" | "REVIEW";
  text: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PROMPTS: DemoPrompt[] = [
  {
    agent: "选品分析",
    kind: "ANALYST",
    text: "找 3 个适合新手起步的高毛利宠物用品，要欧美市场的",
    icon: TrendingUp,
  },
  {
    agent: "短视频创作",
    kind: "DIRECTOR",
    text: "给这款便携榨汁杯生成一支 15 秒带货短视频，叙事角度你帮我挑",
    icon: Video,
  },
  {
    agent: "Listing 内容",
    kind: "LISTING",
    text: "给这款便携榨汁杯写一套英文 Listing，标题带核心关键词",
    icon: FileText,
  },
  {
    agent: "投放复盘",
    kind: "REVIEW",
    text: "分析我店铺上周的投流报表，哪些素材值得加预算？",
    icon: BarChart3,
  },
];

const TYPE_MS = 62;
const DELETE_MS = 22;
const HOLD_MS = 2400;

function useTypewriter() {
  const [pi, setPi] = useState(0);
  const [chars, setChars] = useState(0);
  const [phase, setPhase] = useState<"typing" | "hold" | "deleting">("typing");
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const full = PROMPTS[pi].text;
    // 减少动效：直接整句轮换
    if (reduced.current) {
      setChars(full.length);
      const t = setTimeout(() => setPi((p) => (p + 1) % PROMPTS.length), 4000);
      return () => clearTimeout(t);
    }
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      t =
        chars < full.length
          ? setTimeout(() => setChars((c) => c + 1), TYPE_MS)
          : setTimeout(() => setPhase("hold"), HOLD_MS);
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("deleting"), 200);
    } else {
      t =
        chars > 0
          ? setTimeout(() => setChars((c) => Math.max(0, c - 2)), DELETE_MS)
          : setTimeout(() => {
              setPi((p) => (p + 1) % PROMPTS.length);
              setPhase("typing");
            }, 260);
    }
    return () => clearTimeout(t);
  }, [pi, chars, phase]);

  return { prompt: PROMPTS[pi], typed: PROMPTS[pi].text.slice(0, chars) };
}

export function HomeHero() {
  const { prompt, typed } = useTypewriter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedKind, setSelectedKind] = useState<DemoPrompt["kind"]>("ANALYST");
  const showDemo = value === "" && !focused;

  function dispatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const task = value.trim() || prompt.text;
    const kind = value.trim() ? selectedKind : prompt.kind;
    window.location.assign(
      `/app?prompt=${encodeURIComponent(task)}&agent=${kind}#agent-composer`,
    );
  }

  return (
    <section className="grain relative overflow-hidden border-b border-black/[0.06] pb-16 pt-12 sm:pb-20 sm:pt-16">
      <div className="gradient-bg absolute inset-0" aria-hidden />
      <div className="app-grid absolute inset-x-0 top-0 h-[42rem] opacity-70" aria-hidden />
      <div aria-hidden className="absolute left-[-8rem] top-28 h-64 w-64 rounded-full border border-brand-200/60" />
      <div aria-hidden className="absolute -right-28 top-16 h-80 w-80 rounded-full border border-blue-200/60" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-end gap-8 lg:grid-cols-[1.35fr_.65fr] lg:gap-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white">AI</span>
              TikTok Shop 数据洞察与 AI 创作
            </div>

            <h1 className="text-display max-w-4xl text-ink">
              {BRAND_SLOGAN_LEAD}<span className="gradient-text">{BRAND_SLOGAN_FOCUS}</span>
            </h1>
          </div>

          <p className="max-w-xl border-l-2 border-brand-400 pl-5 text-base text-zinc-600 text-cjk-relaxed sm:text-lg lg:mb-2">
            从真实榜单里找机会，再让 AI 帮你选品、做视频、写 Listing、复盘投放。
            <br className="hidden sm:block" />
            每一步都有结果，下一步接着用。
          </p>
        </div>

        {/* 真实 composer：访客可直接输入，空闲时打字机演示真实指令 */}
        <div className="relative isolate mx-auto mt-10 max-w-5xl sm:mt-12">
          <DkAura className="absolute left-1/2 top-[70px] z-0 w-[78%] -translate-x-1/2 -translate-y-1/2" />

          <form onSubmit={dispatch} className="dk-composer relative z-10 overflow-hidden text-left">
            <div className="relative">
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => {
                  setFocused(true);
                  if (!value) setSelectedKind(prompt.kind);
                }}
                onBlur={() => setFocused(false)}
                rows={2}
                aria-label="告诉 Agent 你想做什么"
                className="min-h-24 w-full resize-none bg-transparent px-5 py-5 text-[15px] leading-relaxed outline-none sm:min-h-28 sm:px-6"
              />
              {showDemo && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 px-5 py-5 text-[15px] leading-relaxed text-zinc-500 sm:px-6"
                >
                  {typed}
                  <span className="ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-[0.18em] animate-pulse rounded-full bg-zinc-400" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-1">
              {PROMPTS.map((p) => {
                const active = showDemo && p.agent === prompt.agent;
                return (
                  <button
                    type="button"
                    key={p.agent}
                    onClick={() => {
                      setSelectedKind(p.kind);
                      setValue(p.text);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                      (showDemo ? active : p.kind === selectedKind)
                        ? "dk-ring text-ink shadow-sm"
                        : "border border-black/10 bg-white text-zinc-500"
                    }`}
                  >
                    <p.icon className="h-3.5 w-3.5" />
                    {p.agent}
                  </button>
                );
              })}

              <button
                type="submit"
                className="bg-vibrant pop ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                <Send className="h-4 w-4" />
                带着指令去工作台
              </button>
            </div>
          </form>

          <RunDemo />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              榜单数据免费浏览 · 使用 AI 才消耗积分
            </span>
            <span className="hidden h-3 w-px bg-zinc-200 sm:block" />
            <span>手机号登录即用 · 无需信用卡</span>
            <span className="hidden h-3 w-px bg-zinc-200 sm:block" />
            <a href="/pricing" className="inline-flex items-center gap-1 font-medium text-zinc-600 hover:text-brand-600">
              查看定价 <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Agent 接力实况：三步循环点亮 ---------- */

type RunStep = {
  agent: string;
  dot: string;
  text: string;
  result: string;
  duration: string;
};

const RUN_STEPS: RunStep[] = [
  {
    agent: "选品分析",
    dot: "bg-brand-500",
    text: "扫描 TikTok Shop 榜单，按毛利底线筛选",
    result: "便携榨汁杯 · ROI 94 · 月销 12.4K",
    duration: "28s",
  },
  {
    agent: "短视频创作",
    dot: "bg-violet-500",
    text: "挑叙事角度，生成 9:16 带货短视频",
    result: "按产品自动选角度 · 直出成片与封面",
    duration: "3m 12s",
  },
  {
    agent: "Listing 内容",
    dot: "bg-sky-500",
    text: "写英文标题、卖点，生成商品主图",
    result: "标题 + 五点卖点 + 主图，可直接上架",
    duration: "41s",
  },
  {
    agent: "投放复盘",
    dot: "bg-emerald-500",
    text: "解析投流报表，跑 ROI 象限",
    result: "Top 素材建议加预算 +30%",
    duration: "19s",
  },
];

const TICK_MS = 1700;

function RunDemo() {
  // tick 0..3 = 第 n 步进行中；4 = 全部完成停留；随后归零循环
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setTick(4));
      return () => cancelAnimationFrame(frame);
    }
    const t = setInterval(
      () => setTick((v) => (v + 1) % (RUN_STEPS.length + 2)),
      TICK_MS,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative mt-6">
      <div
        aria-hidden
        className="absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-gradient-to-b from-transparent to-zinc-300"
      />
      <div className="dk-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <span className="font-display text-xs font-semibold text-ink">
            发送之后，Agent 这样接力
          </span>
          <span className="text-2xs text-zinc-400 nums">链路演示</span>
        </div>
        <ul>
          {RUN_STEPS.map((s, i) => {
            const done = i < tick;
            const active = i === tick;
            return (
              <li
                key={s.agent}
                className={`flex items-center gap-3 px-5 py-3 transition-colors duration-500 ${
                  active ? "bg-zinc-50/80" : ""
                } ${i > 0 ? "border-t border-black/[0.04]" : ""}`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-white text-zinc-500 ring-1 ring-zinc-300"
                        : "bg-zinc-100 text-transparent"
                  }`}
                >
                  {done ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : active ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                  )}
                </span>

                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium transition-opacity duration-500 ${
                    done || active ? "text-zinc-700 opacity-100" : "text-zinc-400 opacity-70"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.agent}
                </span>

                <span
                  className={`min-w-0 flex-1 truncate text-xs transition-opacity duration-500 ${
                    done || active ? "text-zinc-500" : "text-zinc-300"
                  }`}
                >
                  {done ? s.result : s.text}
                </span>

                <span className="hidden shrink-0 text-2xs text-zinc-400 nums sm:block">
                  {done ? s.duration : active ? "进行中" : "排队中"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
