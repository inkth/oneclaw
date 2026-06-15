import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "./workbench";
import { type ComposerKind } from "./agent-composer";
import { type StreamTask } from "./task-stream";
import { HotPicks, type HotPick } from "./hot-picks";

export const metadata = { title: "工作台 · OneClaw" };

// 工作台只挂分析/复盘;创作类(DIRECTOR/LISTING)在独立的「创作」页。
const WORKBENCH_KINDS = new Set(["ANALYST", "REVIEW"]);
const CREATE_KINDS = new Set(["DIRECTOR", "LISTING"]);

type RanklistProduct = {
  productId: string;
  name: string;
  region: string;
  avgPriceCents: number;
  commissionRate: number;
  totalSaleCnt: number;
  coverUrls: string[];
  importedProductId: string | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 其他页面可带 ?agent=…&prompt=…&productId=… 接力进来。
  const sp = await searchParams;

  // 旧链接兼容:创作类接力(如选品库「为它做视频」)转交创作页。
  if (CREATE_KINDS.has(sp.agent ?? "")) {
    const qs = new URLSearchParams();
    qs.set("agent", sp.agent!);
    if (sp.prompt) qs.set("prompt", sp.prompt);
    if (sp.productId) qs.set("productId", sp.productId);
    redirect(`/app/create?${qs.toString()}`);
  }

  const initialAgent = WORKBENCH_KINDS.has(sp.agent ?? "")
    ? (sp.agent as ComposerKind)
    : undefined;
  const initialInput = sp.prompt || undefined;

  // 游客可浏览;爆品榜走公共端点。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;

  const ranklistQuery = "region=US&rank_type=1&product_rank_field=1&page_size=6";
  const [ranklist, tasks] = await Promise.all([
    apiServer<{ products: RanklistProduct[] }>(
      workspace
        ? `/workspaces/${workspace.id}/discover/ranklist?${ranklistQuery}`
        : `/discover/ranklist?${ranklistQuery}`,
    ).catch(() => ({ products: [] as RanklistProduct[] })),
    workspace
      ? apiServer<{ tasks: StreamTask[] }>(`/workspaces/${workspace.id}/agent-tasks`)
          .then((d) => d.tasks ?? [])
          .catch(() => [] as StreamTask[])
      : Promise.resolve([] as StreamTask[]),
  ]);

  const picks: HotPick[] = (ranklist.products ?? []).slice(0, 3).map((p) => ({
    productId: p.productId,
    name: p.name,
    region: p.region,
    avgPrice: p.avgPriceCents / 100,
    commissionRate: p.commissionRate,
    totalSaleCnt: p.totalSaleCnt,
    coverUrl: p.coverUrls?.[0] ?? null,
    importedProductId: p.importedProductId,
  }));

  const isFresh = tasks.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <HotPicks workspaceId={workspace?.id ?? ""} picks={picks} isGuest={!workspace} />

      {/* 派活区:选品分析 / 投放复盘;任务流汇总全部 Agent 的进展 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">派个活</h2>
          <Link
            href="/app/create"
            className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-ink"
          >
            做视频 / Listing 去创作 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {/* key:弹窗内登录后 refresh 重传 props,强制重挂载以重置 useState(initial*) */}
        <Workbench
          key={user?.id ?? "guest"}
          workspaceId={workspace?.id ?? ""}
          isGuest={!workspace}
          showPresets={!!workspace && isFresh}
          initialTasks={tasks}
          streamLimit={6}
          initialAgent={initialAgent}
          initialInput={initialInput}
          agents={["ANALYST", "REVIEW"]}
          align="start"
        />
      </div>
    </div>
  );
}
