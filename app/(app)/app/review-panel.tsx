"use client";

import { useRouter } from "next/navigation";
import {
  Activity,
  Clapperboard,
  MousePointerClick,
  ShoppingCart,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { type Tone } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { QUADRANT_META, type Quadrant, type ReviewResult } from "@/lib/review/types";
import { CopyButton } from "./copy-button";

const QUADRANT_BG: Record<Tone, string> = {
  brand: "border-brand-100 bg-brand-50/40",
  neutral: "border-zinc-200/80 bg-zinc-50/60",
  success: "border-emerald-100 bg-emerald-50/40",
  warning: "border-amber-100 bg-amber-50/40",
  danger: "border-rose-100 bg-rose-50/40",
  info: "border-sky-100 bg-sky-50/40",
  violet: "border-violet-100 bg-violet-50/40",
  fuchsia: "border-fuchsia-100 bg-fuchsia-50/40",
};

// 四象限按矩阵摆放：左下 / 右上对角，符合 Cost×ROI 直觉
const QUADRANT_LAYOUT: Quadrant[] = ["potential", "winner", "longtail", "bleeder"];
const PRIORITY_TONE: Record<string, Tone> = { P0: "danger", P1: "warning", P2: "neutral" };

const pct = (n: number) => (n * 100).toFixed(1) + "%";
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * 复盘 → 做视频接力指令:优先用明星素材(高消耗高 ROI),其次潜力素材(低消耗高 ROI、待放量),
 * 把赢家创意的方向写进 DIRECTOR 指令,让下一条视频延续已被验证的钩子/卖点。
 */
function relayVideoPrompt(r: ReviewResult): string {
  const winners = r.quadrants.winner ?? [];
  const potentials = r.quadrants.potential ?? [];
  const ref = winners.length ? winners : potentials;
  if (ref.length === 0) {
    return "参考上次投流复盘的赢家创意特征,再做一条高转化的带货短视频。";
  }
  const titles = ref
    .slice(0, 2)
    .map((it) => it.title)
    .filter(Boolean)
    .join("、");
  const label = winners.length ? "明星素材" : "潜力素材";
  const why = winners.length ? "高消耗高 ROI、已被验证" : "低消耗高 ROI、值得放量";
  return `参考上次投流复盘:${label}「${titles}」表现最好(${why})。再做一条同方向的带货短视频,延续它们的开场钩子和卖点角度。`;
}

/**
 * 复盘结果仪表盘（纯展示）：健康度基线 + Cost×ROI 象限 + 优化行动清单 + Gemini 深挖提示词。
 * 计算全在 Go 后端完成，这里只渲染 ReviewResult。由「店铺投流数据分析」Agent 在工作台内调用。
 */
export function ReviewResults({ result }: { result: ReviewResult }) {
  const { baseline: b, counts, quadrants, actions } = result;
  const roiOk = b.roi >= b.targetRoi;
  const router = useRouter();
  const hasWinners = (quadrants.winner?.length ?? 0) + (quadrants.potential?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* 健康度基线 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Target}
          label="大盘 ROI"
          value={b.roi.toFixed(2)}
          hint={`目标 ${b.targetRoi.toFixed(1)}`}
          tone={roiOk ? "success" : "danger"}
        />
        <StatCard icon={MousePointerClick} label="平均 CTR" value={pct(b.avgCtr)} hint={`${b.rowCount} 条视频`} />
        <StatCard icon={ShoppingCart} label="平均 CVR" value={pct(b.avgCvr)} hint={`总 GMV ${num(b.totalGmv)}`} />
        <StatCard
          icon={Activity}
          label="平均 2s 完播"
          value={b.avgView2s != null ? pct(b.avgView2s) : "—"}
          hint={b.avgView2s != null ? "钩子留存" : "报表无完播列"}
        />
      </div>

      {/* 象限分析 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">象限分析 · Cost × ROI</h2>
          <span className="text-2xs text-zinc-400">消耗中位数 {num(b.costThreshold)} 为高/低分界</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {QUADRANT_LAYOUT.map((q) => {
            const meta = QUADRANT_META[q];
            const items = quadrants[q];
            return (
              <div key={q} className={cn("rounded-xl border p-4", QUADRANT_BG[meta.tone as Tone])}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={meta.tone as Tone}>{meta.name}</Badge>
                    <span className="text-2xs text-zinc-400">{meta.cond}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-zinc-800">{counts[q]}</span>
                </div>
                <p className="mt-1.5 text-2xs leading-relaxed text-zinc-500">{meta.strategy}</p>
                {items.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {items.slice(0, 3).map((it) => (
                      <li key={it.videoId} className="flex items-center justify-between gap-2 text-2xs">
                        <span className="truncate text-zinc-600">{it.title}</span>
                        <span className="shrink-0 tabular-nums text-zinc-400">ROI {it.roi.toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* 复盘 → 行动接力:把赢家方向直接接到「做视频」,闭环不断点 */}
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xs leading-relaxed text-zinc-600">
            {hasWinners
              ? "把这次复盘的赢家方向接力成下一条视频 —— 指令已按明星/潜力素材预填,可再改。"
              : "样本里还没跑出明星素材,先按复盘结论再做一条试试方向。"}
          </p>
          <button
            onClick={() =>
              router.push(
                `/app?agent=DIRECTOR&prompt=${encodeURIComponent(relayVideoPrompt(result))}`,
              )
            }
            className="press inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl bg-[#1c1d1f] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-black sm:self-auto"
          >
            <Clapperboard className="h-3.5 w-3.5" />
            再做一条视频
          </button>
        </div>
      </Card>

      {/* 优化行动清单 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">优化行动清单</h2>
          <span className="text-2xs text-zinc-400">按优先级与消耗排序，最多 30 条</span>
        </div>
        <TableWrap minWidth={760}>
          <THead>
            <Tr>
              <Th>Video / Title</Th>
              <Th>当前问题</Th>
              <Th>建议操作</Th>
              <Th align="center">优先级</Th>
            </Tr>
          </THead>
          <tbody>
            {actions.map((a, i) => (
              <Tr key={`${a.videoId}-${i}`}>
                <Td className="max-w-[200px] truncate font-medium text-zinc-800">{a.title}</Td>
                <Td className="text-zinc-600">{a.problem}</Td>
                <Td className="text-zinc-600">{a.action}</Td>
                <Td align="center">
                  <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      </div>

      {/* AI 深挖分析（gemini-3.5-flash）；未运行时回退为可手动复制的提示词 */}
      {result.analysis ? (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge tone="violet" icon={<Sparkles className="h-3 w-3" />}>
                AI 深挖分析
              </Badge>
              <span className="text-xs text-zinc-500">由 Gemini 基于本次基线与重点素材生成</span>
            </div>
            <CopyButton text={result.analysis} />
          </div>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-4 text-xs leading-relaxed text-zinc-700">
            {result.analysis}
          </pre>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge tone="violet" icon={<Sparkles className="h-3 w-3" />}>
                Gemini 创意深挖
              </Badge>
              <span className="text-xs text-zinc-500">AI 深挖未运行，复制提示词可手动深挖</span>
            </div>
            <CopyButton text={result.geminiPrompt} />
          </div>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3 text-2xs leading-relaxed text-zinc-600">
            {result.geminiPrompt}
          </pre>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
          <Icon className="h-4 w-4" />
        </div>
        {tone && <span className={cn("h-2 w-2 rounded-full", tone === "success" ? "bg-emerald-500" : tone === "danger" ? "bg-rose-500" : "bg-zinc-300")} />}
      </div>
      <div className="mt-5 text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
      {hint && <div className="mt-1 text-2xs text-zinc-400">{hint}</div>}
    </div>
  );
}
