"use client";

import { useRef, useState } from "react";
import {
  Activity,
  ArrowUpFromLine,
  FileSpreadsheet,
  Loader2,
  MousePointerClick,
  ShoppingCart,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { type Tone } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { QUADRANT_META, type Quadrant, type ReviewResult } from "@/lib/review/types";
import { CopyButton } from "./copy-button";

const QUADRANT_BG: Record<Tone, string> = {
  brand: "border-indigo-100 bg-indigo-50/40",
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

export function ReviewClient({ workspaceId }: { workspaceId: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [targetRoi, setTargetRoi] = useState("3.0");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function analyze() {
    if (!workspaceId) {
      toast.error("请先登录后再上传报表");
      return;
    }
    if (!file) {
      toast.error("先选择 GMVMax 报表文件");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("targetRoi", targetRoi);
      const res = await fetch(`/api/workspaces/${workspaceId}/review/analyze`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error?.message || "分析失败，请检查报表格式");
        return;
      }
      setResult(json.data.result as ReviewResult);
      const w = json.data.result.warnings as string[];
      if (w?.length) toast.message(w[0]);
      else toast.success("复盘完成");
    } catch {
      toast.error("网络异常，稍后再试");
    } finally {
      setLoading(false);
    }
  }

  function onPick(f: File | null) {
    setFile(f);
    setResult(null);
  }

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="复盘"
        badge={
          <Badge tone="brand" icon={<Sparkles className="h-3 w-3" />}>
            GMVMax 数据诊断
          </Badge>
        }
        description="上传 Creative Hub 导出的广告报表（CSV / Excel），自动跑出健康度基线、Cost×ROI 象限分诊与优化行动清单。"
      />

      {/* 上传与参数 */}
      <Card>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onPick(f);
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-8 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,text/csv"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-indigo-600 ring-1 ring-zinc-200">
            {file ? <FileSpreadsheet className="h-5 w-5" /> : <ArrowUpFromLine className="h-5 w-5" />}
          </div>
          {file ? (
            <div className="text-sm font-medium text-zinc-800">{file.name}</div>
          ) : (
            <>
              <div className="text-sm font-medium text-zinc-700">点击或拖入报表文件</div>
              <div className="text-2xs text-zinc-400">
                支持 .csv / .tsv / .xlsx，需含 Cost、GMV、曝光、点击、订单、完播率等列
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            ROI 目标
            <input
              type="number"
              step="0.1"
              min="0"
              value={targetRoi}
              onChange={(e) => setTargetRoi(e.target.value)}
              className="h-9 w-20 rounded-lg border border-zinc-200 px-2 text-sm tabular-nums focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-2xs text-zinc-400">象限以此为高/低 ROI 分界</span>
          </label>
          <Button variant="primary" onClick={analyze} disabled={loading || !file}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "分析中…" : "开始复盘"}
          </Button>
        </div>
        {!workspaceId && (
          <p className="mt-3 text-2xs text-amber-600">登录后即可上传报表分析。</p>
        )}
      </Card>

      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }: { result: ReviewResult }) {
  const { baseline: b, counts, quadrants, actions } = result;
  const roiOk = b.roi >= b.targetRoi;

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

      {/* Gemini 深挖提示词 */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge tone="violet" icon={<Sparkles className="h-3 w-3" />}>
              Gemini 创意深挖
            </Badge>
            <span className="text-xs text-zinc-500">已注入本次基线与重点素材</span>
          </div>
          <CopyButton text={result.geminiPrompt} />
        </div>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3 text-2xs leading-relaxed text-zinc-600">
          {result.geminiPrompt}
        </pre>
      </Card>
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
