"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, Clapperboard, LayoutList, RotateCcw, Trash2, Loader2, Package, MoreHorizontal, Pencil, Check, Sparkles } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaPlaceholder } from "@/components/ui/MediaPlaceholder";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Delta } from "@/components/ui/Delta";
import { Popover } from "@/components/ui/Popover";

type Status = "CANDIDATE" | "RECOMMENDED" | "EVALUATING" | "ARCHIVED";
type CostSource = "ESTIMATE" | "MANUAL" | "SOURCED";
// 自建商品 Listing 生成进度(后端 ProductListItem.listingStatus);空 = 无 Listing 任务。
type ListingStatus = "GENERATING" | "IMAGING" | "READY" | "FAILED" | "";

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
  listingStatus?: ListingStatus;
  shop: { id: string; name: string; platform: string } | null;
};

const listingStatusMap: Record<"GENERATING" | "IMAGING" | "FAILED", { label: string; cls: string; spin: boolean }> = {
  GENERATING: { label: "文案生成中", cls: "bg-violet-50 text-violet-700", spin: true },
  IMAGING: { label: "主图生成中", cls: "bg-violet-50 text-violet-700", spin: true },
  FAILED: { label: "生成失败", cls: "bg-rose-50 text-rose-600", spin: false },
};

// 商品缩略图:有封面用真图(失败回退渐变占位),无封面用 seed 占位。
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
        className="h-9 w-9 shrink-0 rounded-lg object-cover bg-zinc-100"
      />
    );
  }
  return <MediaPlaceholder seed={seed} rounded="rounded-lg" className="h-9 w-9 shrink-0" />;
}

const statusMap: Record<Status, { label: string; cls: string }> = {
  CANDIDATE: { label: "候选", cls: "bg-sky-50 text-sky-700" },
  EVALUATING: { label: "评估中", cls: "bg-amber-50 text-amber-700" },
  RECOMMENDED: { label: "推荐", cls: "bg-emerald-50 text-emerald-700" },
  ARCHIVED: { label: "已归档", cls: "bg-zinc-100 text-zinc-500" },
};

// 成本来源角标:估算(系统按品类/市场)↔ 真实(用户回填)↔ 比价(货源,预留)。
const costSourceMap: Record<CostSource, { label: string; cls: string; title: string }> = {
  ESTIMATE: {
    label: "估算",
    cls: "bg-amber-50 text-amber-700",
    title: "系统按品类/目标市场估算的落地成本,点成本可回填你的真实进货价",
  },
  MANUAL: {
    label: "真实",
    cls: "bg-emerald-50 text-emerald-700",
    title: "你回填的真实进货价,毛利率据此重算",
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

// 选品 → 创作的接力:带着产品上下文跳到工作台,预选对应 Agent 并预填指令。
// 只带创作意图;价格/卖点/市场数据由后端按 productId 从收藏商品真实数据注入,避免 URL 里的快照过期。
function videoPromptFor(p: Product): string {
  return `为「${p.title}」生成一条 UGC 风格 TikTok 带货短视频,真人开箱口播感。`;
}

function listingPromptFor(p: Product): string {
  return `为「${p.title}」生成一套 TikTok Shop Listing:标题、五点卖点、A+ 结构、主图方案。`;
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
}: {
  workspaceId: string;
  initialProducts: Product[];
  embedded?: boolean;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editCostId, setEditCostId] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState("");
  const committedRef = useRef<string | null>(null); // 去重:Enter 后失焦不重复提交

  const visible =
    filter === "ALL" ? products : products.filter((p) => p.status === filter);

  // 把 Go 商品列表项归一成本组件的 Product(补 shop 兜底)。
  function mapGo(p: Partial<Product> & { id: string }): Product {
    return { shop: null, ...p } as Product;
  }

  // 任一商品仍在生成(文案/主图)时轮询商品列表,卡片「生成中 → 成品」自填充。
  const hasActive = products.some(
    (p) => p.listingStatus === "GENERATING" || p.listingStatus === "IMAGING",
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
    <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full p-0.5 self-start">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => setFilter(f.key)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === f.key
              ? "bg-brand-600 text-white shadow-sm"
              : "text-zinc-600 hover:text-brand-700"
          }`}
        >
          {f.label}
          <span className={`ml-1 text-2xs ${filter === f.key ? "text-brand-200" : "text-zinc-400"}`}>
            {f.key === "ALL"
              ? products.length
              : products.filter((p) => p.status === f.key).length}
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

  // 回填真实进货价:后端据此重算毛利并把 costSource 标为 MANUAL,合并回行内。
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
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("确定删除？")) return;
    setBusyId(id);
    try {
      await apiBrowser(`/workspaces/${workspaceId}/products/${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex justify-end">{filterBar}</div>
      ) : (
        <PageHeader
          title="收藏 · 商品"
          description="你从爆品榜收藏的,或在素材库「批量做商品」生成的商品,按推进阶段管理。"
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
          title={filter === "ALL" ? "还没有收藏的商品" : "这个分类下还没有商品"}
          description={
            <>
              去 <Link href="/app/discover/products" className="text-brand-600">爆品榜</Link> 点「收藏」，
              或在 <Link href="/app/assets/materials" className="text-brand-600">素材库</Link> 多选你拍的商品图「批量做商品」，一键生成商品卡 + Listing。
            </>
          }
        />
      ) : (
        <TableWrap minWidth={760}>
            <THead>
              <tr>
                <Th>商品</Th>
                <Th>店铺</Th>
                <Th>品类</Th>
                <Th align="right">ROI</Th>
                <Th align="right">毛利率</Th>
                <Th align="right">月销</Th>
                <Th align="right">14d</Th>
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
                          {p.listingStatus && p.listingStatus !== "READY" && listingStatusMap[p.listingStatus] && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium leading-none ${listingStatusMap[p.listingStatus].cls}`}
                            >
                              {listingStatusMap[p.listingStatus].spin && (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              )}
                              {listingStatusMap[p.listingStatus].label}
                            </span>
                          )}
                          {p.listingStatus === "READY" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-medium leading-none text-emerald-700"
                              title="Listing 已生成,可在「为它做 Listing」查看/复制"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              Listing 就绪
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
                                className="w-14 rounded border border-brand-300 bg-white px-1 py-0.5 text-2xs font-mono text-zinc-800 outline-none focus:border-brand-500"
                              />
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()} // 保住输入焦点,避免先触发 blur
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
                              className="inline-flex items-center gap-0.5 rounded px-0.5 text-zinc-600 underline decoration-dotted underline-offset-2 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                              title="点击回填你的真实进货价,毛利率会据此重算"
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
                  <Td className="text-zinc-600">
                    {p.shop ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-2xs">
                        {p.shop.name}
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </Td>
                  <Td className="text-zinc-600">{p.category}</Td>
                  <Td align="right" className="font-semibold nums">
                    {p.roiScore}
                  </Td>
                  <Td align="right" className="nums">
                    <span
                      title={
                        p.costSource === "ESTIMATE"
                          ? "基于估算成本,回填真实进货价后更准"
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
                        <>
                          <button
                            onClick={() =>
                              router.push(
                                `/app?agent=DIRECTOR&productId=${p.id}&prompt=${encodeURIComponent(videoPromptFor(p))}`,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-2xs font-medium text-brand-700 hover:bg-brand-100"
                            title="带着这个产品的上下文去做短视频"
                          >
                            <Clapperboard className="h-2.5 w-2.5" />
                            为它做视频
                          </button>
                          <button
                            onClick={() =>
                              router.push(
                                `/app?agent=LISTING&productId=${p.id}&prompt=${encodeURIComponent(listingPromptFor(p))}`,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-2xs font-medium text-sky-700 hover:bg-sky-100"
                            title="带着这个产品的上下文去做 Listing(标题/五点/A+/主图)"
                          >
                            <LayoutList className="h-2.5 w-2.5" />
                            为它做 Listing
                          </button>
                        </>
                      )}
                      <Popover
                        align="end"
                        trigger={({ open }) => (
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 ${open ? "bg-zinc-100 text-zinc-700" : ""}`}
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
                                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
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
                                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
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
      )}
    </div>
  );
}
