"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clapperboard,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  RefreshCw,
  Shirt,
  Sparkles,
  Star,
  Check,
} from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { PageHeader } from "@/components/ui/PageHeader";

type Aplus = { heading: string; body: string; imagePrompt: string };

export type Kit = {
  product: {
    id: string;
    title: string;
    emoji?: string | null;
    status: string;
    priceCents: number;
    costCents: number;
    costSource: string;
    marginPct: number;
    note?: string | null;
    coverUrl?: string;
  };
  videos: { id: string; title: string; videoUrl?: string | null; thumbnailUrl?: string | null }[];
  listing?: {
    taskId: string;
    title: string;
    sellingPoints: string[];
    hashtags: string[];
    aplusSections?: Aplus[];
    images?: string[];
    imagePrompts?: string[];
    imagesStatus?: string;
  };
};

const statusLabel: Record<string, string> = {
  CANDIDATE: "候选",
  EVALUATING: "评估中",
  RECOMMENDED: "推荐",
  ARCHIVED: "已归档",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`已复制${label}`),
    () => toast.error("复制失败"),
  );
}

export function ProductDetail({
  workspaceId,
  productId,
  initialKit,
}: {
  workspaceId: string;
  productId: string;
  initialKit: Kit;
}) {
  const router = useRouter();
  const [kit, setKit] = useState<Kit>(initialKit);
  const [titleDraft, setTitleDraft] = useState(kit.product.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [priceDraft, setPriceDraft] = useState((kit.product.priceCents / 100).toFixed(2));
  const [costDraft, setCostDraft] = useState((kit.product.costCents / 100).toFixed(2));
  const [savingInfo, setSavingInfo] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [coverBusy, setCoverBusy] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const p = kit.product;
  const listing = kit.listing;
  const gallery = Array.from(
    new Set([p.coverUrl, ...(listing?.images ?? [])].filter(Boolean) as string[]),
  );

  async function refetchKit() {
    try {
      const r = await apiBrowser<{ kit: Kit }>(`/workspaces/${workspaceId}/products/${productId}/publish-kit`);
      if (mounted.current) setKit(r.kit);
      return r.kit;
    } catch {
      return null;
    }
  }

  async function patchProduct(patch: Record<string, unknown>) {
    return apiBrowser<{ product: { priceCents: number; costCents: number; marginPct: number; costSource: string; title: string } }>(
      `/workspaces/${workspaceId}/products/${productId}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
  }

  async function saveTitle() {
    const t = titleDraft.trim();
    setEditingTitle(false);
    if (!t || t === p.title) return;
    try {
      await patchProduct({ title: t });
      setKit((k) => ({ ...k, product: { ...k.product, title: t } }));
      toast.success("已保存标题");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function saveInfo() {
    const price = Math.round(parseFloat(priceDraft) * 100);
    const cost = Math.round(parseFloat(costDraft) * 100);
    if (!Number.isFinite(price) || !Number.isFinite(cost) || price < 0 || cost < 0) {
      toast.error("请输入有效金额");
      return;
    }
    setSavingInfo(true);
    try {
      const r = await patchProduct({ priceCents: price, costCents: cost });
      setKit((k) => ({
        ...k,
        product: {
          ...k.product,
          priceCents: r.product.priceCents,
          costCents: r.product.costCents,
          marginPct: r.product.marginPct,
          costSource: r.product.costSource,
        },
      }));
      setEditingInfo(false);
      toast.success("已保存价格 / 成本,毛利已重算");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingInfo(false);
    }
  }

  async function setCover(url: string) {
    setCoverBusy(url);
    try {
      await patchProduct({ coverUrl: url });
      setKit((k) => ({ ...k, product: { ...k.product, coverUrl: url } }));
      toast.success("已设为商品主图");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "设置失败");
    } finally {
      setCoverBusy(null);
    }
  }

  // 补出主图:对当前 Listing 任务触发出图(消耗额度),轮询至完成后刷新画廊。
  async function addImages() {
    if (!listing) return;
    if (!confirm("将为这套 Listing 生成主图(每张约 6 积分,最多 3 张)。继续?")) return;
    setImaging(true);
    try {
      await apiBrowser(`/workspaces/${workspaceId}/agent-tasks/${listing.taskId}/images`, { method: "POST" });
      for (let i = 0; i < 60 && mounted.current; i++) {
        await sleep(5000);
        const { task } = await apiBrowser<{ task: { metadata?: { imagesStatus?: string } } }>(
          `/workspaces/${workspaceId}/agent-tasks/${listing.taskId}`,
        );
        const st = task?.metadata?.imagesStatus;
        if (st === "DONE" || st === "FAILED") {
          await refetchKit();
          toast[st === "DONE" ? "success" : "error"](st === "DONE" ? "主图已生成" : "主图生成失败,可重试");
          break;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "出图失败");
    } finally {
      if (mounted.current) setImaging(false);
    }
  }

  // 重写 Listing:基于当前商品派一个新的 LISTING 任务(文案),完成后刷新详情。
  async function rewriteListing() {
    if (!confirm("将基于这个商品重新生成一套 Listing 文案(约 3 积分)。继续?")) return;
    setRewriting(true);
    try {
      const { task } = await apiBrowser<{ task: { id: string } }>(
        `/workspaces/${workspaceId}/agent-tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            agent: "LISTING",
            productId,
            input: `为「${p.title}」重新生成一套 TikTok Shop Listing:标题、五点卖点、A+ 结构、主图方案。`,
          }),
        },
      );
      for (let i = 0; i < 36 && mounted.current; i++) {
        await sleep(5000);
        const { task: t } = await apiBrowser<{ task: { status: string } }>(
          `/workspaces/${workspaceId}/agent-tasks/${task.id}`,
        );
        if (t.status === "DONE" || t.status === "FAILED") {
          if (t.status === "DONE") {
            await refetchKit();
            toast.success("Listing 已重写,可继续补主图");
          } else {
            toast.error("重写失败,请重试");
          }
          break;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重写失败");
    } finally {
      if (mounted.current) setRewriting(false);
    }
  }

  const canAddImages = !!listing && (listing.imagePrompts?.length ?? 0) > 0 && listing.imagesStatus !== "RUNNING";

  return (
    <div className="space-y-6">
      <Link
        href="/app/assets/products"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回我的商品
      </Link>

      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {p.emoji && <span>{p.emoji}</span>}
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  else if (e.key === "Escape") {
                    setTitleDraft(p.title);
                    setEditingTitle(false);
                  }
                }}
                className="rounded border border-brand-300 px-1.5 py-0.5 text-lg outline-none focus:border-brand-500"
              />
            ) : (
              <button
                onClick={() => {
                  setTitleDraft(p.title);
                  setEditingTitle(true);
                }}
                title="点击改名"
                className="hover:text-brand-700"
              >
                {p.title}
              </button>
            )}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-2xs font-medium text-zinc-600">
              {statusLabel[p.status] ?? p.status}
            </span>
          </span>
        }
        description="单个商品的工作台:组装 Listing、补主图、做视频,推到可上架。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push(`/app?agent=DIRECTOR&productId=${productId}`)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
            >
              <Clapperboard className="h-3.5 w-3.5" />
              为它做视频
            </button>
            <button
              onClick={() => router.push(`/app?agent=LISTING&productId=${productId}`)}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
            >
              <Shirt className="h-3.5 w-3.5" />
              做上身图
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左:主图画廊 + 基础信息 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200/80 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">主图</h3>
              {canAddImages && (
                <button
                  onClick={addImages}
                  disabled={imaging}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-2xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {imaging ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                  {imaging ? "生成中…" : "补出主图"}
                </button>
              )}
            </div>
            {gallery.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg bg-zinc-50 text-xs text-zinc-400">
                还没有主图
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {gallery.map((url) => {
                  const isCover = url === p.coverUrl;
                  return (
                    <div key={url} className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                      {isCover && (
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-2xs font-medium text-white">
                          <Star className="h-2.5 w-2.5" />
                          主图
                        </span>
                      )}
                      {!isCover && (
                        <button
                          onClick={() => setCover(url)}
                          disabled={coverBusy === url}
                          className="absolute inset-x-1.5 bottom-1.5 hidden group-hover:inline-flex items-center justify-center gap-1 rounded-full bg-black/70 px-2 py-1 text-2xs font-medium text-white hover:bg-black/85 disabled:opacity-60"
                        >
                          {coverBusy === url ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                          设为主图
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">基础信息</h3>
              {!editingInfo ? (
                <button onClick={() => setEditingInfo(true)} className="text-2xs text-brand-600 hover:text-brand-700">
                  编辑
                </button>
              ) : (
                <button
                  onClick={saveInfo}
                  disabled={savingInfo}
                  className="inline-flex items-center gap-1 text-2xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60"
                >
                  {savingInfo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  保存
                </button>
              )}
            </div>
            {editingInfo ? (
              <div className="space-y-2 text-xs">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">售价 $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceDraft}
                    onChange={(e) => setPriceDraft(e.target.value)}
                    className="w-24 rounded border border-zinc-300 px-2 py-1 text-right font-mono outline-none focus:border-brand-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">成本 $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costDraft}
                    onChange={(e) => setCostDraft(e.target.value)}
                    className="w-24 rounded border border-zinc-300 px-2 py-1 text-right font-mono outline-none focus:border-brand-500"
                  />
                </label>
              </div>
            ) : (
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">售价</dt>
                  <dd className="font-mono">${(p.priceCents / 100).toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">成本{p.costSource === "ESTIMATE" ? "(估算)" : ""}</dt>
                  <dd className="font-mono">${(p.costCents / 100).toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">毛利率</dt>
                  <dd className="font-mono">{p.costSource === "ESTIMATE" ? "~" : ""}{p.marginPct}%</dd>
                </div>
              </dl>
            )}
          </div>
        </div>

        {/* 右:Listing 内容 */}
        <div className="space-y-4 lg:col-span-2">
          {!listing ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-zinc-300" />
              <p className="mt-2 text-sm text-zinc-600">这个商品还没有 Listing</p>
              <button
                onClick={rewriteListing}
                disabled={rewriting}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {rewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                生成 Listing
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900">Listing 文案</h3>
                  <button
                    onClick={rewriteListing}
                    disabled={rewriting}
                    className="inline-flex items-center gap-1 text-2xs text-zinc-500 hover:text-brand-700 disabled:opacity-60"
                  >
                    {rewriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    重写
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-2xs font-medium text-zinc-400">标题</span>
                      <button onClick={() => copy(listing.title, "标题")} className="text-zinc-400 hover:text-brand-600">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm text-zinc-800">{listing.title}</p>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-2xs font-medium text-zinc-400">五点卖点</span>
                      <button
                        onClick={() => copy(listing.sellingPoints.map((s, i) => `${i + 1}. ${s}`).join("\n"), "五点")}
                        className="text-zinc-400 hover:text-brand-600"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-700">
                      {listing.sellingPoints.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>

                  {listing.hashtags && listing.hashtags.length > 0 && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-2xs font-medium text-zinc-400">标签</span>
                        <button onClick={() => copy(listing.hashtags.join(" "), "标签")} className="text-zinc-400 hover:text-brand-600">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-xs text-brand-600">{listing.hashtags.join(" ")}</p>
                    </div>
                  )}
                </div>
              </div>

              {listing.aplusSections && listing.aplusSections.length > 0 && (
                <div className="rounded-xl border border-zinc-200/80 bg-white p-4">
                  <h3 className="mb-3 text-sm font-semibold text-zinc-900">A+ 图文结构</h3>
                  <div className="space-y-3">
                    {listing.aplusSections.map((sec, i) => (
                      <div key={i} className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-xs font-medium text-zinc-800">{sec.heading}</div>
                        <p className="mt-1 text-xs text-zinc-600">{sec.body}</p>
                        {sec.imagePrompt && (
                          <p className="mt-1 text-2xs text-zinc-400">↳ 配图 prompt:{sec.imagePrompt}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {kit.videos.length > 0 && (
            <div className="rounded-xl border border-zinc-200/80 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-900">成片</h3>
              <div className="space-y-2">
                {kit.videos.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 p-2 text-xs">
                    <span className="truncate text-zinc-700">{v.title || "短视频"}</span>
                    {v.videoUrl && (
                      <a
                        href={v.videoUrl}
                        download
                        className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
                      >
                        <Download className="h-3 w-3" />
                        下载
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
