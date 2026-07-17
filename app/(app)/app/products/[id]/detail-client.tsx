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
  Sparkles,
  Star,
  Check,
} from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { useReportPageEntity } from "../../page-entity";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
    images?: string[];
    sourceImages?: string[];
    imagesStatus?: string;
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

// 下载用同源相对路径（生产 nginx 同域）;本地分端口时由 NEXT_PUBLIC_API_BASE 指定。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`已复制${label}`),
    () => toast.error("复制失败，请手动选择文本"),
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
  // 上报当前自建商品给情境助手：LISTING/DIRECTOR 派活可结构化注入该商品
  useReportPageEntity({ kind: "my-product", id: productId, name: kit.product.title, productId });
  const [titleDraft, setTitleDraft] = useState(kit.product.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [priceDraft, setPriceDraft] = useState((kit.product.priceCents / 100).toFixed(2));
  const [costDraft, setCostDraft] = useState((kit.product.costCents / 100).toFixed(2));
  const [savingInfo, setSavingInfo] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [shotRetrying, setShotRetrying] = useState(false);
  const [coverBusy, setCoverBusy] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const p = kit.product;
  const listing = kit.listing;
  const videos = kit.videos ?? []; // 后端无成片时返回 null,这里兜底成空数组，避免 .length 崩页
  // 画廊 = 生成的展示图 + 当前封面 + Listing 主图 + 用户原图（多角度），去重。
  const gallery = Array.from(
    new Set(
      [...(p.images ?? []), p.coverUrl, ...(listing?.images ?? []), ...(p.sourceImages ?? [])].filter(
        Boolean,
      ) as string[],
    ),
  );
  const imagingShots = p.imagesStatus === "PENDING" || p.imagesStatus === "RUNNING";

  async function refetchKit() {
    try {
      const r = await apiBrowser<{ kit: Kit }>(`/workspaces/${workspaceId}/products/${productId}/publish-kit`);
      if (mounted.current) setKit(r.kit);
      return r.kit;
    } catch {
      return null;
    }
  }

  // 展示图还在出（刚从批量进来）时轮询，直到 DONE/FAILED。
  useEffect(() => {
    if (!imagingShots) return;
    const timer = setInterval(() => { void refetchKit(); }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagingShots]);

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
      toast.error(e instanceof Error ? e.message : "保存失败，稍后再试");
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
      toast.success("已保存价格 / 成本，毛利已重算");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败，稍后再试");
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
      toast.error(e instanceof Error ? e.message : "设置失败，稍后再试");
    } finally {
      setCoverBusy(null);
    }
  }

  // 重出展示图：批量做商品的出图失败后重试（消耗出图额度）。
  // 标 RUNNING 后 imagingShots 变 true，交给上面的轮询把成品刷回来。
  async function retryShots() {
    setShotRetrying(true);
    try {
      await apiBrowser(`/workspaces/${workspaceId}/products/${productId}/images`, { method: "POST" });
      setKit((k) => ({ ...k, product: { ...k.product, imagesStatus: "RUNNING" } }));
      toast.success("已开始重新生成商品图，约 1-2 分钟");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重试失败，稍后再试");
    } finally {
      setShotRetrying(false);
    }
  }

  // 补出主图：对当前 Listing 任务触发出图（消耗额度），轮询至完成后刷新画廊。
  async function addImages() {
    if (!listing) return;
    if (!confirm("将为这套 Listing 生成主图（每张约 6 积分，最多 3 张）。继续？")) return;
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
          toast[st === "DONE" ? "success" : "error"](st === "DONE" ? "主图已生成" : "主图生成失败，可重试");
          break;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "出图失败，稍后再试");
    } finally {
      if (mounted.current) setImaging(false);
    }
  }

  // 生成/重写 Listing 进入会话：带商品上下文跳工作台，在会话里可用语言指挥改哪里、强调什么,
  // 反复优化（一次性在详情页改不如对话顺手）。生成的 Listing 关联本商品，回详情即见最新。
  function goListingChat() {
    const prompt =
      "为这个商品生成/优化一套 TikTok Shop Listing（标题/五点卖点/图文详情/主图）。可以直接说要强调什么、改哪一段。";
    router.push(`/app?agent=LISTING&productId=${productId}&prompt=${encodeURIComponent(prompt)}`);
  }

  const canAddImages = !!listing && (listing.imagePrompts?.length ?? 0) > 0 && listing.imagesStatus !== "RUNNING";

  return (
    <div className="space-y-6">
      <Link
        href="/app/assets/products"
        className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-[var(--dk-action-regular)] hover:text-zinc-900"
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
                className="rounded-lg border border-brand-300 px-1.5 py-0.5 text-lg outline-none focus:border-brand-500"
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
            <span className="rounded-full bg-[var(--dk-surface-2)] px-2 py-0.5 text-2xs font-medium text-zinc-600">
              {statusLabel[p.status] ?? p.status}
            </span>
          </span>
        }
        description="单个商品的工作台：组装 Listing、补主图、做视频，推到可上架。"
        actions={
          <Button
            variant="subtle"
            size="sm"
            onClick={() => router.push(`/app?agent=DIRECTOR&productId=${productId}`)}
          >
            <Clapperboard className="h-3.5 w-3.5" />
            为它做视频
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左：主图画廊 + 基础信息 */}
        <div className="space-y-4">
          <div className="dk-card p-5">
            <SectionHeader
              title="商品图"
              actions={
                <div className="flex items-center gap-2">
                {gallery.length > 0 && (
                  <a
                    href={`${API_BASE}/api/v1/workspaces/${workspaceId}/products/${productId}/images.zip`}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--dk-surface-2)] px-2.5 py-1 text-2xs font-medium text-zinc-600 hover:bg-[var(--dk-action-regular)]"
                    title="把这些商品图打包成 zip 下载"
                  >
                    <Download className="h-3 w-3" />
                    下载全部
                  </a>
                )}
                {imagingShots ? (
                  <span className="inline-flex items-center gap-1 text-2xs text-violet-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    出图中…
                  </span>
                ) : p.imagesStatus === "FAILED" && (p.sourceImages?.length ?? 0) > 0 ? (
                  <button
                    onClick={retryShots}
                    disabled={shotRetrying}
                    title="展示图生成失败，点击按原图重新生成（消耗出图积分）"
                    className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-2xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                  >
                    {shotRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {shotRetrying ? "提交中…" : "出图失败 · 重试"}
                  </button>
                ) : canAddImages && (
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
              }
            />
            {gallery.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg bg-[var(--dk-surface-2)] text-xs text-zinc-400">
                还没有主图
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {gallery.map((url) => {
                  const isCover = url === p.coverUrl;
                  return (
                    <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-zinc-50">
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
                          className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-full bg-black/70 px-2 py-1 text-2xs font-medium text-white transition-opacity hover:bg-black/85 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
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

          <div className="dk-card p-5">
            <SectionHeader
              title="基础信息"
              actions={!editingInfo ? (
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
            />
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
                    className="w-24 rounded-lg border border-[var(--dk-stroke-border)] px-2 py-1 text-right font-mono outline-none focus:border-brand-500"
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
                    className="w-24 rounded-lg border border-[var(--dk-stroke-border)] px-2 py-1 text-right font-mono outline-none focus:border-brand-500"
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

        {/* 右：Listing 内容 */}
        <div className="space-y-4 lg:col-span-2">
          {!listing ? (
            <EmptyState
              icon={Sparkles}
              title="这个商品还没有 Listing"
              description="让 Listing Agent 根据商品信息生成标题、卖点和图文详情结构。"
              action={
                <Button variant="primary" size="sm" onClick={goListingChat}>
                  <Sparkles className="h-3.5 w-3.5" />
                  生成 Listing
                </Button>
              }
            />
          ) : (
            <>
              <div className="dk-card p-5">
                <SectionHeader
                  title="Listing 文案"
                  className="mb-3"
                  actions={
                    <button
                      onClick={goListingChat}
                      title="回到对话重新生成，也可以说明要改哪段、强调什么"
                      className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-2xs font-medium text-zinc-500 hover:bg-[var(--dk-action-regular)] hover:text-brand-700"
                    >
                      <RefreshCw className="h-3 w-3" />
                      去对话重写
                    </button>
                  }
                />

                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-2xs font-medium text-zinc-400">标题</span>
                      <button
                        onClick={() => copy(listing.title, "标题")}
                        aria-label="复制 Listing 标题"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-[var(--dk-action-regular)] hover:text-brand-600"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm text-zinc-900">{listing.title}</p>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-2xs font-medium text-zinc-400">五点卖点</span>
                      <button
                        onClick={() => copy((listing.sellingPoints ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n"), "五点")}
                        aria-label="复制五点卖点"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-[var(--dk-action-regular)] hover:text-brand-600"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-600">
                      {(listing.sellingPoints ?? []).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>

                  {listing.hashtags && listing.hashtags.length > 0 && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-2xs font-medium text-zinc-400">标签</span>
                        <button
                          onClick={() => copy(listing.hashtags.join(" "), "标签")}
                          aria-label="复制标签"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-[var(--dk-action-regular)] hover:text-brand-600"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {listing.hashtags.map((tag) => (
                          <span key={tag} className="rounded-full bg-brand-50 px-2 py-1 text-2xs font-medium text-brand-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {listing.aplusSections && listing.aplusSections.length > 0 && (
                <div className="dk-card p-5">
                  <SectionHeader
                    title="图文详情结构"
                    actions={
                      <button
                        onClick={goListingChat}
                        title="回到对话重新生成，也可以说明要改哪段、强调什么"
                        className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-2xs font-medium text-zinc-500 hover:bg-[var(--dk-action-regular)] hover:text-brand-700"
                      >
                        <RefreshCw className="h-3 w-3" />
                        去对话重新生成
                      </button>
                    }
                  />
                  <div className="space-y-3">
                    {listing.aplusSections.map((sec, i) => (
                      <div key={i} className="rounded-xl border border-black/[0.045] bg-[var(--dk-surface-2)] p-3.5">
                        <div className="text-xs font-medium text-zinc-900">{sec.heading}</div>
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

          {videos.length > 0 && (
            <div className="dk-card p-5">
              <SectionHeader icon={Clapperboard} title="成片" meta={`${videos.length} 条`} />
              <div className="space-y-2">
                {videos.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--dk-surface-2)] px-3 py-2.5 text-xs">
                    <span className="truncate text-zinc-600">{v.title || "短视频"}</span>
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
