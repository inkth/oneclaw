"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArrowRight, RotateCcw, Trash2, Loader2, Package, MoreHorizontal, Pencil, Check, Sparkles } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaPlaceholder } from "@/components/ui/MediaPlaceholder";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Delta } from "@/components/ui/Delta";
import { Popover } from "@/components/ui/Popover";

type Status = "CANDIDATE" | "RECOMMENDED" | "EVALUATING" | "ARCHIVED";
type CostSource = "ESTIMATE" | "MANUAL" | "SOURCED";
// 自建商品出图进度（后端 Product.imagesStatus）;空 = 非自建/无出图。
type ImagesStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "";

export type Product = {
  id: string;
  title: string;
  category: string;
  emoji: string | null;
  priceCents: number;
  costCents: number;
  costSource: CostSource;
  marginPct: number;
  roiScore: number;
  monthlySales: number;
  trendDelta: number;
  status: Status;
  note: string | null;
  coverUrl?: string;
  images?: string[];
  imagesStatus?: ImagesStatus;
  discoverProductId?: string | null; // 非空=EchoTik 收藏；空=用户自建（素材图生成）
};

// 商品范围：all=全部 · self=自建（资产/商品）· discover=EchoTik 收藏（收藏/商品）。
export type ProductScope = "all" | "self" | "discover";

const imagesStatusMap: Record<"RUNNING" | "FAILED", { label: string; cls: string; spin: boolean }> = {
  RUNNING: { label: "出图中", cls: "bg-violet-50 text-violet-700", spin: true },
  FAILED: { label: "出图失败", cls: "bg-rose-50 text-rose-600", spin: false },
};

// 商品缩略图：有封面用真图（失败回退渐变占位），无封面用 seed 占位。
function Thumb({ src, seed }: { src?: string; seed: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-lg object-cover bg-[var(--dk-surface-2)]"
      />
    );
  }
  return <MediaPlaceholder seed={seed} rounded="rounded-lg" className="h-9 w-9 shrink-0" />;
}

const statusMap: Record<Status, { label: string; cls: string }> = {
  CANDIDATE: { label: "候选", cls: "bg-sky-50 text-sky-700" },
  EVALUATING: { label: "评估中", cls: "bg-amber-50 text-amber-700" },
  RECOMMENDED: { label: "推荐", cls: "bg-emerald-50 text-emerald-700" },
  ARCHIVED: { label: "已归档", cls: "bg-[var(--dk-surface-2)] text-zinc-500" },
};

// 成本来源角标：估算（系统按品类/市场）↔ 真实（用户回填）↔ 比价（货源，预留）。
const costSourceMap: Record<CostSource, { label: string; cls: string; title: string }> = {
  ESTIMATE: {
    label: "估算",
    cls: "bg-amber-50 text-amber-700",
    title: "系统按品类/目标市场估算的落地成本，点成本可回填你的真实进货价",
  },
  MANUAL: {
    label: "真实",
    cls: "bg-emerald-50 text-emerald-700",
    title: "你回填的真实进货价，毛利率据此重算",
  },
  SOURCED: {
    label: "比价",
    cls: "bg-sky-50 text-sky-700",
    title: "货源比价回填的成本",
  },
};

function CostBadge({ source }: { source: CostSource }) {
  const c = costSourceMap[source] ?? costSourceMap.ESTIMATE;
  return (
    <span
      title={c.title}
      className={`inline-flex rounded-full px-1.5 py-0.5 text-2xs font-medium leading-none ${c.cls}`}
    >
      {c.label}
    </span>
  );
}

const filters: Array<{ key: "ALL" | Status; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "CANDIDATE", label: "候选" },
  { key: "EVALUATING", label: "评估中" },
  { key: "RECOMMENDED", label: "推荐" },
  { key: "ARCHIVED", label: "归档" },
];

export function ProductsClient({
  workspaceId,
  initialProducts,
  embedded = false,
  scope = "all",
}: {
  workspaceId: string;
  initialProducts: Product[];
  embedded?: boolean;
  scope?: ProductScope;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editCostId, setEditCostId] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState("");
  const committedRef = useRef<string | null>(null); // 去重：Enter 后失焦不重复提交

  // 按范围切分：self=自建（无 discoverProductId）· discover=EchoTik 收藏 · all=全部。
  // 列表接口返回全部商品，这里据来源过滤，轮询刷新后过滤口径不变。
  const scoped = products.filter((p) =>
    scope === "self" ? !p.discoverProductId : scope === "discover" ? !!p.discoverProductId : true,
  );

  const visible =
    filter === "ALL" ? scoped : scoped.filter((p) => p.status === filter);

  function mapGo(p: Partial<Product> & { id: string }): Product {
    return p as Product;
  }

  // 本范围内任一商品仍在生成（文案/主图）时轮询商品列表，卡片「生成中 → 成品」自填充。
  const hasActive = scoped.some(
    (p) => p.imagesStatus === "PENDING" || p.imagesStatus === "RUNNING",
  );
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(async () => {
      try {
        const data = await apiBrowser<{ products: Array<Partial<Product> & { id: string }> }>(
          `/workspaces/${workspaceId}/products`,
        );
        setProducts(data.products.map(mapGo));
      } catch {
        /* 轮询失败静默重试 */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [hasActive, workspaceId]);

  const filterBar = (
    <div className="flex items-center gap-1.5 bg-[var(--dk-surface-2)] rounded-full p-0.5 self-start">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => setFilter(f.key)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            // 选中态近黑实底，与 Pill 一致（品牌紫只留给成交 CTA 与焦点环）
            filter === f.key
              ? "bg-[var(--dk-btn-black)] text-white"
              : "text-zinc-500 hover:bg-[var(--dk-action-regular)] hover:text-zinc-900"
          }`}
        >
          {f.label}
          <span className={`ml-1 text-2xs ${filter === f.key ? "text-white/70" : "text-zinc-400"}`}>
            {f.key === "ALL"
              ? scoped.length
              : scoped.filter((p) => p.status === f.key).length}
          </span>
        </button>
      ))}
    </div>
  );

  function startEditCost(p: Product) {
    committedRef.current = null;
    setEditCostId(p.id);
    setCostDraft((p.costCents / 100).toFixed(2));
  }

  // 回填真实进货价：后端据此重算毛利并把 costSource 标为 MANUAL,合并回行内。
  async function commitCost(p: Product) {
    if (committedRef.current === p.id) return;
    committedRef.current = p.id;
    setEditCostId(null);
    const dollars = parseFloat(costDraft);
    const cents = Math.round(dollars * 100);
    if (Number.isFinite(dollars) && dollars >= 0 && cents !== p.costCents) {
      await patchProduct(p.id, { costCents: cents });
    }
    committedRef.current = null;
  }

  async function patchProduct(id: string, patch: Partial<Product>) {
    setBusyId(id);
    setError(null);
    try {
      const data = await apiBrowser<{ product: Product }>(
        `/workspaces/${workspaceId}/products/${id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.product } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败，稍后再试");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("删除该商品？删除后不可恢复。")) return;
    setBusyId(id);
    try {
      await apiBrowser(`/workspaces/${workspaceId}/products/${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败，稍后再试");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex justify-end">{filterBar}</div>
      ) : scope === "self" ? (
        <PageHeader
          title="我的商品"
          description="管理从素材创建的商品，继续补主图、写 Listing 或做视频。"
          actions={filterBar}
        />
      ) : (
        <PageHeader
          title="收藏 · 商品"
          description="管理从爆品榜收藏的商品，跟进成本、利润和创作进度。"
          actions={filterBar}
        />
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            filter !== "ALL"
              ? "这个分类下还没有商品"
              : scope === "self"
                ? "还没有自建商品"
                : "还没有收藏的商品"
          }
          description={
            scope === "self" ? (
              <>
                去 <Link href="/app/assets/materials" className="text-brand-600">素材库</Link> 上传并选择商品图，生成商品卡和 Listing。
              </>
            ) : (
              <>
                去 <Link href="/app/discover/products" className="text-brand-600">爆品榜</Link> 收藏值得跟进的商品，它们会出现在这里。
              </>
            )
          }
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {visible.map((p) => (
              <article
                key={p.id}
                className="rounded-2xl border border-black/[0.065] bg-white p-4 shadow-[0_1px_2px_rgba(18,20,25,.025)]"
              >
                <div className="flex items-start gap-3">
                  <Thumb src={p.coverUrl} seed={p.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/app/products/${p.id}`} className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                        {p.title}
                      </Link>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${statusMap[p.status].cls}`}>
                        {statusMap[p.status].label}
                      </span>
                    </div>
                    {(p.imagesStatus === "PENDING" || p.imagesStatus === "RUNNING" || p.imagesStatus === "DONE") && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-zinc-500">
                        {(p.imagesStatus === "PENDING" || p.imagesStatus === "RUNNING") && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${imagesStatusMap.RUNNING.cls}`}>
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> 出图中
                          </span>
                        )}
                        {p.imagesStatus === "DONE" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                            <Sparkles className="h-2.5 w-2.5" /> 已出图
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-zinc-500 nums">
                  <span>售价 ${(p.priceCents / 100).toFixed(2)}</span>
                  <span className="text-zinc-300">·</span>
                  <span>成本</span>
                  {editCostId === p.id ? (
                    <span className="inline-flex items-center gap-1">
                      <span>$</span>
                      <input
                        autoFocus
                        type="number"
                        step="0.01"
                        min="0"
                        value={costDraft}
                        onChange={(e) => setCostDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitCost(p);
                          if (e.key === "Escape") {
                            committedRef.current = p.id;
                            setEditCostId(null);
                          }
                        }}
                        onBlur={() => commitCost(p)}
                        className="h-7 w-16 rounded-lg border border-brand-300 bg-white px-2 text-xs outline-none"
                      />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditCost(p)}
                      disabled={busyId === p.id}
                      className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-medium text-zinc-700 hover:bg-[var(--dk-action-regular)]"
                    >
                      ${(p.costCents / 100).toFixed(2)} <Pencil className="h-2.5 w-2.5" />
                    </button>
                  )}
                  <CostBadge source={p.costSource} />
                </div>

                <div className="mt-3 grid grid-cols-4 divide-x divide-black/[0.055] rounded-xl bg-[var(--dk-surface-2)] px-1 py-2.5 text-center">
                  <div>
                    <div className="text-2xs text-zinc-400">ROI</div>
                    <div className="mt-0.5 text-xs font-semibold nums">{p.roiScore}</div>
                  </div>
                  <div>
                    <div className="text-2xs text-zinc-400">毛利率</div>
                    <div className="mt-0.5 text-xs font-semibold nums">
                      {p.costSource === "ESTIMATE" ? "~" : ""}{p.marginPct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs text-zinc-400">月销</div>
                    <div className="mt-0.5 text-xs font-semibold nums">{p.monthlySales.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-2xs text-zinc-400">14 天</div>
                    <div className="mt-0.5 text-xs font-semibold nums">
                      <Delta value={p.trendDelta} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.055] pt-3">
                  <Link href={`/app/products/${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                    打开详情 <ArrowRight className="h-3 w-3" />
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => patchProduct(p.id, { status: p.status === "ARCHIVED" ? "EVALUATING" : "ARCHIVED" })}
                      disabled={busyId === p.id}
                      className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-2xs font-medium text-zinc-500 hover:bg-[var(--dk-action-regular)]"
                    >
                      {p.status === "ARCHIVED" ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                      {p.status === "ARCHIVED" ? "恢复" : "归档"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProduct(p.id)}
                      disabled={busyId === p.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`删除商品 ${p.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <TableWrap minWidth={640} className="hidden md:block">
            <THead>
              <tr>
                <Th>商品</Th>
                <Th align="right">ROI</Th>
                <Th align="right">毛利率</Th>
                <Th align="right">月销</Th>
                <Th align="right">近 14 天</Th>
                <Th align="center">状态</Th>
                <Th align="right">操作</Th>
              </tr>
            </THead>
            <tbody>
              {visible.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb src={p.coverUrl} seed={p.id} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/app/products/${p.id}`}
                            className="font-medium hover:text-brand-700 hover:underline"
                            title={p.note ?? "查看商品详情"}
                          >
                            {p.title}
                          </Link>
                          {(p.imagesStatus === "PENDING" || p.imagesStatus === "RUNNING") && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium leading-none ${imagesStatusMap.RUNNING.cls}`}>
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              {imagesStatusMap.RUNNING.label}
                            </span>
                          )}
                          {p.imagesStatus === "FAILED" && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium leading-none ${imagesStatusMap.FAILED.cls}`}>
                              {imagesStatusMap.FAILED.label}
                            </span>
                          )}
                          {p.imagesStatus === "DONE" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-medium leading-none text-emerald-700"
                              title="商品图已生成，点「打开详情」查看/设主图/生成文案"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              已出图
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-zinc-500 font-mono nums flex flex-wrap items-center gap-x-1 gap-y-0.5">
                          <span>${(p.priceCents / 100).toFixed(2)}</span>
                          <span className="text-zinc-300">·</span>
                          <span>成本</span>
                          {editCostId === p.id ? (
                            <span className="inline-flex items-center gap-0.5">
                              <span>$</span>
                              <input
                                autoFocus
                                type="number"
                                step="0.01"
                                min="0"
                                value={costDraft}
                                onChange={(e) => setCostDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitCost(p);
                                  else if (e.key === "Escape") {
                                    committedRef.current = p.id; // 阻止随后的失焦提交
                                    setEditCostId(null);
                                  }
                                }}
                                onBlur={() => commitCost(p)}
                                className="w-14 rounded border border-brand-300 bg-white px-1 py-0.5 text-2xs font-mono text-zinc-900 outline-none focus:border-brand-500"
                              />
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()} // 保住输入焦点，避免先触发 blur
                                onClick={() => commitCost(p)}
                                title="保存真实进货价"
                                className="text-brand-600 hover:text-brand-700"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => startEditCost(p)}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-0.5 rounded px-0.5 text-zinc-600 underline decoration-dotted underline-offset-2 hover:bg-[var(--dk-action-regular)] hover:text-zinc-900 disabled:opacity-50"
                              title="点击回填你的真实进货价，毛利率会据此重算"
                            >
                              ${(p.costCents / 100).toFixed(2)}
                              {busyId === p.id ? (
                                <Loader2 className="h-2 w-2 animate-spin" />
                              ) : (
                                <Pencil className="h-2 w-2 opacity-50" />
                              )}
                            </button>
                          )}
                          <CostBadge source={p.costSource} />
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td align="right" className="font-semibold nums">
                    {p.roiScore}
                  </Td>
                  <Td align="right" className="nums">
                    <span
                      title={
                        p.costSource === "ESTIMATE"
                          ? "基于估算成本，回填真实进货价后更准"
                          : "基于真实进货价"
                      }
                      className={p.costSource === "ESTIMATE" ? "text-zinc-400" : undefined}
                    >
                      {p.costSource === "ESTIMATE" ? "~" : ""}
                      {p.marginPct}%
                    </span>
                  </Td>
                  <Td align="right" className="nums">
                    {p.monthlySales.toLocaleString()}
                  </Td>
                  <Td align="right" className="nums">
                    <Delta value={p.trendDelta} title="近 14 天变化" className="text-xs" />
                  </Td>
                  <Td align="center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${statusMap[p.status].cls}`}
                    >
                      {statusMap[p.status].label}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status !== "ARCHIVED" && (
                        <Link
                          href={`/app/products/${p.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--dk-btn-tertiary)] px-2.5 py-1 text-2xs font-medium text-zinc-900 hover:bg-[var(--dk-btn-tertiary-hover)]"
                          title="进入商品详情：做 Listing / 补主图 / 为它做视频"
                        >
                          打开详情
                          <ArrowRight className="h-2.5 w-2.5" />
                        </Link>
                      )}
                      <Popover
                        align="end"
                        trigger={({ open }) => (
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-[var(--dk-action-regular)] hover:text-[var(--dk-content-primary)] ${open ? "bg-[var(--dk-action-regular)] text-[var(--dk-content-primary)]" : ""}`}
                            title="更多操作"
                          >
                            {busyId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                        panelClassName="min-w-[8rem] p-1"
                      >
                        {({ close }) => (
                          <div className="flex flex-col">
                            {p.status === "ARCHIVED" ? (
                              <button
                                onClick={() => {
                                  patchProduct(p.id, { status: "EVALUATING" });
                                  close();
                                }}
                                disabled={busyId === p.id}
                                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-[var(--dk-action-regular)] disabled:opacity-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                恢复
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  patchProduct(p.id, { status: "ARCHIVED" });
                                  close();
                                }}
                                disabled={busyId === p.id}
                                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-[var(--dk-action-regular)] disabled:opacity-50"
                              >
                                <Archive className="h-3.5 w-3.5" />
                                归档
                              </button>
                            )}
                            <button
                              onClick={() => {
                                deleteProduct(p.id);
                                close();
                              }}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          </div>
                        )}
                      </Popover>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}
    </div>
  );
}
