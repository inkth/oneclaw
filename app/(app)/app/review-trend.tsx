"use client";

import { Activity, MousePointerClick, ShoppingCart, Target, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { cn } from "@/lib/utils";
import { QUADRANT_META, type Quadrant, type ReviewResult } from "@/lib/review/types";
import { type Tone } from "@/lib/ui/tokens";
import { type StreamTask } from "./task-stream";

type Snap = { at: string; r: ReviewResult };

// 相对上次的百分比变化;上次为 0 / 非有限值返回 null,Stat 不渲染 delta(避免除零得到 ∞)。
function pctChange(now: number, prev: number): number | null {
  if (!isFinite(now) || !isFinite(prev) || prev === 0) return null;
  return ((now - prev) / Math.abs(prev)) * 100;
}

// 象限增减的语义色:好象限(明星/潜力)变多为正向(绿),浪费象限变多为负向(红),长尾中性。
// 不能直接用 Delta —— 它一律「升=绿」,会把「浪费素材变多」错标成好事。
function migrationTone(q: Quadrant, delta: number): string {
  if (delta === 0) return "text-zinc-400";
  if (q === "bleeder") return delta > 0 ? "text-rose-600" : "text-emerald-600";
  if (q === "winner" || q === "potential") return delta > 0 ? "text-emerald-600" : "text-rose-600";
  return "text-zinc-400";
}

const QUADRANT_ORDER: Quadrant[] = ["winner", "potential", "bleeder", "longtail"];
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

/**
 * 复盘趋势:把历次「店铺投流数据分析」任务串成时间序列,一眼看大盘 ROI/CTR/CVR 与象限结构有没有在变好。
 * 纯展示、零额外请求:数据来自工作台已有的 REVIEW 任务(metadata.review),累计 ≥2 次才出现。
 */
export function ReviewTrend({ tasks }: { tasks: StreamTask[] }) {
  const snaps: Snap[] = tasks
    .filter((t) => t.agent === "REVIEW" && t.status === "DONE" && t.metadata?.review)
    .map((t) => ({ at: t.createdAt, r: t.metadata!.review! }))
    .sort((a, b) => a.at.localeCompare(b.at)); // 旧 → 新(时间序列左旧右新)

  if (snaps.length < 2) return null;

  const base = snaps.map((s) => s.r.baseline);
  const now = base[base.length - 1];
  const prev = base[base.length - 2];
  const lastCounts = snaps[snaps.length - 1].r.counts;
  const prevCounts = snaps[snaps.length - 2].r.counts;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="brand" icon={<TrendingUp className="h-3 w-3" />}>
            复盘趋势
          </Badge>
          <span className="text-sm font-semibold text-zinc-900">大盘在变好吗</span>
        </div>
        <span className="text-2xs text-zinc-400">近 {snaps.length} 次 · 变化对比上次</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={Target}
          size="lg"
          label="大盘 ROI"
          value={now.roi.toFixed(2)}
          hint={`目标 ${now.targetRoi.toFixed(1)}`}
          trend={pctChange(now.roi, prev.roi)}
          spark={base.map((b) => b.roi)}
        />
        <Stat
          icon={MousePointerClick}
          size="lg"
          label="平均 CTR"
          value={fmtPct(now.avgCtr)}
          trend={pctChange(now.avgCtr, prev.avgCtr)}
          spark={base.map((b) => b.avgCtr)}
        />
        <Stat
          icon={ShoppingCart}
          size="lg"
          label="平均 CVR"
          value={fmtPct(now.avgCvr)}
          trend={pctChange(now.avgCvr, prev.avgCvr)}
          spark={base.map((b) => b.avgCvr)}
        />
      </div>

      {/* 象限迁移:各象限数量较上次的增减 —— 浪费素材变少 / 明星素材变多即向好 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1 text-2xs text-zinc-400">
          <Activity className="h-3 w-3" /> 象限迁移
        </span>
        {QUADRANT_ORDER.map((q) => {
          const d = (lastCounts[q] ?? 0) - (prevCounts[q] ?? 0);
          const meta = QUADRANT_META[q];
          return (
            <span key={q} className="inline-flex items-center gap-1.5 text-2xs">
              <Badge tone={meta.tone as Tone}>{meta.name}</Badge>
              <span className="tabular-nums font-medium text-zinc-600">{lastCounts[q] ?? 0}</span>
              {d !== 0 && (
                <span className={cn("tabular-nums font-medium", migrationTone(q, d))}>
                  {d > 0 ? `↑${d}` : `↓${Math.abs(d)}`}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
