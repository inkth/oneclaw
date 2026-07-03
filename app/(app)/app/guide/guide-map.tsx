"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronDown, Clock3, Wallet } from "lucide-react";
import { GUIDE_STEPS, type GuideStep } from "@/lib/guide/steps";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";

/**
 * 跨境带货全流程地图:6 步竖排时间线,逐步展开「成本/周期/常见坑/术语」。
 * 每步诚实标注谁来干:发现猫能干的挂接力按钮(带预填 prompt 跳工作台),
 * 得用户自己干的只给指引。内容全部预制(lib/guide/steps.ts),零 token 瞬开。
 */
export function GuideMap() {
  // 默认展开第一步,给「点开有东西」的示范;其余收起保持一屏看完全流程。
  const [open, setOpen] = useState<string | null>(GUIDE_STEPS[0].key);

  return (
    <ol className="relative space-y-3">
      {/* 时间线竖线:穿过每步序号徽章的中心 */}
      <div
        aria-hidden
        className="absolute bottom-6 left-[19px] top-6 w-px bg-zinc-200"
      />
      {GUIDE_STEPS.map((step, i) => (
        <StepCard
          key={step.key}
          step={step}
          index={i}
          open={open === step.key}
          onToggle={() => setOpen(open === step.key ? null : step.key)}
        />
      ))}
    </ol>
  );
}

function StepCard({
  step,
  index,
  open,
  onToggle,
}: {
  step: GuideStep;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const cat = step.owner === "cat";
  const identity = step.agent ? AGENT_IDENTITY[step.agent as keyof typeof AGENT_IDENTITY] : null;
  // 复盘无预填指令(入口是上传报表),其余接力卡带 prompt 落进输入框
  const relayHref = step.agent
    ? `/app?agent=${step.agent}${step.relayPrompt ? `&prompt=${encodeURIComponent(step.relayPrompt)}` : ""}`
    : null;

  return (
    <li className="relative pl-12">
      {/* 序号徽章:发现猫步骤电紫、自营步骤中性灰,盖在竖线上 */}
      <span
        className={`absolute left-0 top-4 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
          cat
            ? "border-brand-100 bg-brand-50 text-brand-600"
            : "border-zinc-200 bg-white text-zinc-500"
        }`}
      >
        {index + 1}
      </span>

      <div className="dk-card overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-start gap-3 px-4 py-4 text-left"
        >
          <step.icon className={`mt-0.5 h-5 w-5 shrink-0 ${cat ? "text-brand-500" : "text-zinc-400"}`} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{step.title}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${
                  cat
                    ? "border-brand-100 bg-brand-50 text-brand-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-500"
                }`}
              >
                {cat ? "发现猫替你干" : "得你自己来"}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{step.tagline}</span>
          </span>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="space-y-4 border-t border-black/5 px-4 py-4">
            {/* 成本 / 周期:量级感,不是报价 */}
            <div className="flex flex-wrap gap-2">
              <MetaChip icon={Wallet} label={step.cost} />
              <MetaChip icon={Clock3} label={step.cycle} />
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                新手最常踩的坑
              </p>
              <ul className="space-y-1">
                {step.pitfalls.map((p) => (
                  <li key={p} className="flex gap-2 text-xs leading-relaxed text-zinc-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink">这一步的黑话</p>
              <dl className="space-y-1">
                {step.terms.map((t) => (
                  <div key={t.term} className="flex gap-2 text-xs leading-relaxed">
                    <dt className="shrink-0 font-medium text-zinc-700">{t.term}</dt>
                    <dd className="text-zinc-500">— {t.def}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* 谁来干 + 接力:能干的直接派活,不能干的只给指引 */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2.5">
              <p className="text-xs text-zinc-500">{step.ownerNote}</p>
              {relayHref && identity && (
                <Link
                  href={relayHref}
                  className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-black"
                >
                  <identity.icon className="h-3.5 w-3.5" />
                  {step.agent === "REVIEW" ? "去上传报表复盘" : `派活给${identity.label}`}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function MetaChip({ icon: Icon, label }: { icon: typeof Wallet; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-2xs font-medium text-zinc-600">
      <Icon className="h-3 w-3 text-zinc-400" />
      {label}
    </span>
  );
}
