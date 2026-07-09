"use client";

import { toast } from "sonner";
import {
  Copy,
  Languages,
  Lightbulb,
  ListChecks,
  Sparkles,
  Target,
} from "lucide-react";
type AnalysisLine = { t?: string; original?: string; zh?: string };
type AnalysisStructure = {
  hook?: string;
  pain?: string;
  selling?: string;
  cta?: string;
};

/** 视频拆解结果数据(后端 videoAnalysisOut / runVideoAnalysis 写入的结构)。 */
export type VideoAnalysisData = {
  lang?: string;
  title?: string;
  summary?: string;
  lines?: AnalysisLine[];
  structure?: AnalysisStructure;
  reusablePoints?: string[];
  adaptations?: string[];
};

/**
 * 视频解析结果:逐句脚本(原文/中文双列、带时间码)+ 带货结构拆解 + 可复用要点 + 改编建议。
 * 数据来自 VIDEO_ANALYSIS 任务的 metadata 或选品视频详情的 analysis(后端结构一致)。
 */
export function VideoAnalysisResult({ data }: { data?: VideoAnalysisData | null }) {
  const m = data ?? {};
  const lines = (m.lines ?? []) as AnalysisLine[];
  const structure = (m.structure ?? {}) as AnalysisStructure;
  const reusablePoints = (m.reusablePoints ?? []) as string[];
  const adaptations = (m.adaptations ?? []) as string[];
  const summary = m.summary as string | undefined;
  const lang = m.lang as string | undefined;

  const structureItems: { key: string; label: string; value?: string }[] = [
    { key: "hook", label: "钩子", value: structure.hook },
    { key: "pain", label: "痛点", value: structure.pain },
    { key: "selling", label: "卖点", value: structure.selling },
    { key: "cta", label: "促单 CTA", value: structure.cta },
  ];
  const hasStructure = structureItems.some((it) => it.value?.trim());

  async function copyScript() {
    const text = lines
      .map((l) => `${l.t ? `[${l.t}] ` : ""}${l.original ?? ""}\n${l.zh ?? ""}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制逐句脚本");
    } catch {
      toast.error("复制失败,请手动选择");
    }
  }

  return (
    <div className="mt-3 space-y-4">
      {summary && (
        <p className="text-sm leading-relaxed text-zinc-700">{summary}</p>
      )}

      {/* 逐句脚本:时间码 + 原文 + 中文翻译 */}
      {lines.length > 0 ? (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Languages className="h-3.5 w-3.5 text-fuchsia-500" />
              逐句脚本{lang ? ` · 原声${lang}` : ""}
            </h4>
            <button
              onClick={copyScript}
              className="press inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-2xs font-medium text-zinc-600 transition-colors hover:border-fuchsia-300 hover:text-fuchsia-700"
            >
              <Copy className="h-3 w-3" />
              复制脚本
            </button>
          </div>
          <ol className="space-y-2">
            {lines.map((l, i) => (
              <li
                key={i}
                className="rounded-xl border border-black/5 bg-zinc-50/60 px-3 py-2"
              >
                {l.t && (
                  <span className="text-2xs font-medium tabular-nums text-zinc-400">
                    {l.t}
                  </span>
                )}
                {l.original && (
                  <p className="text-sm leading-relaxed text-zinc-800">{l.original}</p>
                )}
                {l.zh && (
                  <p className="mt-0.5 text-sm leading-relaxed text-fuchsia-700">{l.zh}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          未检测到口播台词(可能是纯音乐/无人声),以下基于画面与节奏的拆解。
        </p>
      )}

      {/* 带货结构拆解 */}
      {hasStructure && (
        <section className="space-y-1.5">
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Target className="h-3.5 w-3.5 text-fuchsia-500" />
            带货结构拆解
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {structureItems
              .filter((it) => it.value?.trim())
              .map((it) => (
                <div
                  key={it.key}
                  className="rounded-xl border border-black/5 bg-white px-3 py-2"
                >
                  <span className="text-2xs font-semibold text-fuchsia-600">
                    {it.label}
                  </span>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-700">
                    {it.value}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 可复用要点 */}
      {reusablePoints.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
            <ListChecks className="h-3.5 w-3.5 text-fuchsia-500" />
            可复用要点
          </h4>
          <ul className="space-y-1">
            {reusablePoints.map((p, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-zinc-700">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-fuchsia-400" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 改编建议 */}
      {adaptations.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Lightbulb className="h-3.5 w-3.5 text-fuchsia-500" />
            改编到你的商品
          </h4>
          <ul className="space-y-1">
            {adaptations.map((a, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-zinc-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-400" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
