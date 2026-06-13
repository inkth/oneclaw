"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, Plus, Sparkles } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { RankMedal } from "@/components/ui/RankMedal";
import { Thumb } from "./discover/_components/shared";
import { fmt, fmtMoney } from "./discover/_components/format";

export type HotPick = {
  productId: string;
  name: string;
  region: string;
  avgPrice: number;
  commissionRate: number;
  totalSaleCnt: number;
  coverUrl: string | null;
  importedProductId: string | null;
};

/**
 * 驾驶舱的今日爆品推荐:EchoTik 榜单前 3,带「导入选品 / AI 分析」接力。
 * 游客可看榜,操作走登录引导;交互与发现页同款(导入 → 选品库,分析 → ANALYST 任务轮询)。
 */
export function HotPicks({
  workspaceId,
  picks,
  isGuest = false,
}: {
  workspaceId: string;
  picks: HotPick[];
  isGuest?: boolean;
}) {
  const router = useRouter();
  const { open: openAuthModal } = useAuthModal();
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());

  if (picks.length === 0) return null;

  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可操作",
      desc: "导入选品、AI 分析都需要账号。榜单随便逛,登录后一键操作。",
    });
    return true;
  }

  async function importProduct(p: HotPick) {
    if (importing.has(p.productId) || gateGuest()) return;
    setImporting((prev) => new Set(prev).add(p.productId));
    try {
      const data = await apiBrowser<{ alreadyExists: boolean }>(
        `/workspaces/${workspaceId}/discover/import-product`,
        {
          method: "POST",
          body: JSON.stringify({
            productId: p.productId,
            region: p.region,
            categoryLabel: "TikTok 爆品",
          }),
        },
      );
      toast.success(
        data.alreadyExists
          ? `选品库里已经有了：${p.name.slice(0, 24)}…`
          : `已加入选品库：${p.name.slice(0, 24)}…`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setImporting((prev) => {
        const n = new Set(prev);
        n.delete(p.productId);
        return n;
      });
    }
  }

  // AI 可行性分析:派发 ANALYST 任务 → 轮询 → toast 弹判定(与发现页同链路)。
  async function analyzeProduct(p: HotPick) {
    if (analyzing.has(p.productId) || gateGuest()) return;
    setAnalyzing((prev) => new Set(prev).add(p.productId));
    try {
      const start = await apiBrowser<{ task: { id: string } }>(
        `/workspaces/${workspaceId}/discover/analyze`,
        { method: "POST", body: JSON.stringify({ productId: p.productId, region: p.region }) },
      );
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const cur = await apiBrowser<{ task: { status: string; output: string | null } }>(
          `/workspaces/${workspaceId}/agent-tasks/${start.task.id}`,
        );
        if (cur.task.status === "DONE") {
          toast.success(`分析完成：${p.name.slice(0, 20)}…`, {
            description: cur.task.output ?? undefined,
            duration: 12000,
          });
          return;
        }
        if (cur.task.status === "FAILED") {
          toast.error("分析失败", { description: cur.task.output ?? "请稍后重试" });
          return;
        }
      }
      toast.message("分析仍在进行", { description: "稍后可在下方任务进展里查看结果" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzing((prev) => {
        const n = new Set(prev);
        n.delete(p.productId);
        return n;
      });
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">今日爆品推荐</h2>
        <Link
          href="/app/discover/products"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-ink"
        >
          逛完整榜单 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {picks.map((p, i) => (
          <div key={p.productId} className="dk-card flex flex-col p-4">
            <div className="flex items-start gap-3">
              <Thumb src={p.coverUrl} name={p.name} className="h-12 w-12 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <RankMedal rank={i + 1} className="h-5 w-5 shrink-0 text-2xs" />
                  <span className="rounded bg-zinc-100 px-1 py-px text-2xs font-medium text-zinc-500">
                    {p.region}
                  </span>
                </div>
                <Link
                  href={`/app/discover/products/${p.productId}?region=${p.region}`}
                  className="mt-1 block truncate text-sm font-medium text-ink hover:text-brand-700"
                  title={p.name}
                >
                  {p.name}
                </Link>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-3 text-2xs tabular-nums text-zinc-500">
              <span>均价 {fmtMoney(p.avgPrice)}</span>
              <span>佣金 {p.commissionRate.toFixed(1)}%</span>
              <span>销量 {fmt(p.totalSaleCnt)}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {p.importedProductId ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-2xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> 已在选品库
                </span>
              ) : (
                <button
                  onClick={() => importProduct(p)}
                  disabled={importing.has(p.productId)}
                  className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-2xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                >
                  {importing.has(p.productId) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  导入选品
                </button>
              )}
              <button
                onClick={() => analyzeProduct(p)}
                disabled={analyzing.has(p.productId)}
                className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-2xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {analyzing.has(p.productId) ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                AI 分析
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
