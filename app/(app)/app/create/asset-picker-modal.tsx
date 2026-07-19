"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3, Check, Clapperboard, Compass, ImagePlus, Loader2, Package, Search, Upload, UserRound, X } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { Button } from "@/components/ui/Button";
import { DialogShell } from "@/components/ui/Dialog";
import { usePersonas } from "../use-personas";
import type { ComposerKind } from "../agent-composer";
import { REGIONS, type Region } from "../discover/_components/regions";
import type { DiscoverSelection, TaskReferenceSelection } from "./asset-chips";

type ProductOption = {
  id: string;
  title: string;
  emoji?: string | null;
  roiScore: number;
  coverUrl?: string | null;
};
type MaterialOption = {
  id: string;
  type: string;
  url: string;
  originalName: string;
};
type DiscoverOption = {
  productId: string;
  name: string;
  nameZh?: string;
  region: string;
  avgPriceCents: number;
  commissionRate: number;
  totalSaleCnt: number;
  coverUrls?: string[];
};
type AnalysisTaskOption = {
  id: string;
  agent: string;
  input: string;
  output: string;
  createdAt: string;
};

type TabKey = "upload" | "product" | "model" | "discover" | "analysis";

/**
 * 资产选择弹窗：把原先散在 composer 底栏的 商品 / 出镜人设 / 素材 三个 picker
 * 合并到一个带 tab 的弹窗里（上传资产 / 商品 / 模特）。
 * 视频保持单个首帧/实拍片段；Listing 复用同一界面，允许多选商品/细节图并选择一位模特。
 * 模特 + 商品/参考图会让 Listing 自动附加一张上身图任务。
 */
export function AssetPickerModal({
  workspaceId,
  activeAgent,
  productId,
  onProductChange,
  discoverSelection,
  onDiscoverSelectionChange,
  referenceTask,
  onReferenceTaskChange,
  personaId,
  onPersonaChange,
  materialIds,
  onMaterialIdsChange,
  onClose,
}: {
  workspaceId: string;
  activeAgent: ComposerKind;
  productId: string | null;
  onProductChange: (id: string | null) => void;
  discoverSelection: DiscoverSelection | null;
  onDiscoverSelectionChange: (selection: DiscoverSelection | null) => void;
  referenceTask: TaskReferenceSelection | null;
  onReferenceTaskChange: (selection: TaskReferenceSelection | null) => void;
  personaId: string | null;
  onPersonaChange: (id: string | null) => void;
  materialIds: string[];
  onMaterialIdsChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const isListing = activeAgent === "LISTING";
  const isAdvisor = activeAgent === "ADVISOR";
  const isAnalyst = activeAgent === "ANALYST";
  const isCreative = activeAgent === "DIRECTOR" || isListing;
  const showModel = activeAgent === "DIRECTOR" || isListing;
  // 短视频可选/可传实拍视频片段:作成片真货开场,AI 只生成承接镜头。
  const allowVideo = activeAgent === "DIRECTOR";
  const maxMaterials = isListing ? 8 : 1;
  const tabs: { key: TabKey; label: string; icon: typeof Upload }[] = isCreative
    ? [
        { key: "upload", label: "上传资产", icon: Upload },
        { key: "product", label: "我的商品", icon: Package },
        ...(showModel ? [{ key: "model" as const, label: "模特", icon: UserRound }] : []),
      ]
    : [
        { key: "product", label: "我的商品", icon: Package },
        { key: "discover", label: "发现商品", icon: Compass },
        ...(isAdvisor ? [{ key: "analysis" as const, label: "已有分析", icon: BarChart3 }] : []),
      ];
  const [tab, setTab] = useState<TabKey>(tabs[0]?.key ?? "product");

  const personas = usePersonas(workspaceId, showModel);
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[] | null>(null);
  const [analysisTasks, setAnalysisTasks] = useState<AnalysisTaskOption[] | null>(null);
  const [discoverProducts, setDiscoverProducts] = useState<DiscoverOption[] | null>(null);
  const [discoverRegion, setDiscoverRegion] = useState<Region>("US");
  const [discoverSearch, setDiscoverSearch] = useState("");

  // 商品 + 素材库一次性拉（弹窗按需打开，挂载即拉）。
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    apiBrowser<{ products: ProductOption[] }>(`/workspaces/${workspaceId}/products`)
      .then((d) => alive && setProducts(d.products ?? []))
      .catch(() => alive && setProducts([]));
    if (isCreative) {
      apiBrowser<{ materials: MaterialOption[] }>(`/workspaces/${workspaceId}/materials`)
        .then((d) => alive && setMaterials((d.materials ?? []).filter((m) => m.type === "IMAGE" || (allowVideo && m.type === "VIDEO"))))
        .catch(() => alive && setMaterials([]));
    }
    if (isAdvisor) {
      apiBrowser<{ tasks: AnalysisTaskOption[] }>(`/workspaces/${workspaceId}/agent-tasks?references=1`)
        .then((d) => alive && setAnalysisTasks(d.tasks ?? []))
        .catch(() => alive && setAnalysisTasks([]));
    }
    return () => {
      alive = false;
    };
  }, [workspaceId, allowVideo, isAdvisor, isCreative]);

  useEffect(() => {
    if (!workspaceId || (!isAdvisor && !isAnalyst)) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setDiscoverProducts(null);
      const keyword = discoverSearch.trim();
      const query = new URLSearchParams({
        region: discoverRegion,
        product_rank_field: "1",
        page_size: keyword ? "30" : "20",
      });
      if (keyword) query.set("keyword", keyword);
      apiBrowser<{ products: DiscoverOption[] }>(`/workspaces/${workspaceId}/discover/ranklist?${query}`)
        .then((data) => alive && setDiscoverProducts(data.products ?? []))
        .catch(() => alive && setDiscoverProducts([]));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [workspaceId, isAdvisor, isAnalyst, discoverRegion, discoverSearch]);

  // ── 上传资产 ──
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: File[]) {
    const availableSlots = isListing ? Math.max(0, maxMaterials - materialIds.length) : 1;
    const accepted = files
      .filter((file) => file.type.startsWith("image/") || (allowVideo && file.type.startsWith("video/")))
      .slice(0, availableSlots);
    if (availableSlots === 0) {
      toast(`最多选择 ${maxMaterials} 张参考素材`);
      return;
    }
    if (accepted.length === 0) {
      toast.error(allowVideo ? "请上传图片或视频文件" : "请上传图片文件");
      return;
    }
    if (accepted.some((file) => file.type.startsWith("video/") && file.size > 50 << 20)) {
      toast.error("视频超过 50MB 上限,请先压缩");
      return;
    }
    setUploading(true);
    try {
      const uploaded: MaterialOption[] = [];
      for (const file of accepted) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials`, {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json?.error?.message ?? "上传失败，稍后再试");
        }
        uploaded.push(json.data.material as MaterialOption);
      }
      setMaterials((prev) => [...uploaded, ...(prev ?? [])]);
      const next = isListing
        ? Array.from(new Set([...materialIds, ...uploaded.map((material) => material.id)])).slice(0, maxMaterials)
        : uploaded.slice(-1).map((material) => material.id);
      onMaterialIdsChange(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误，请检查网络后重试");
    } finally {
      setUploading(false);
    }
  }

  const selectedProduct = products?.find((p) => p.id === productId) ?? null;
  const selectedPersona = personas?.find((m) => m.id === personaId) ?? null;
  const selectedMaterials = (materials ?? []).filter((material) => materialIds.includes(material.id));
  const selectedCount = isCreative
    ? (productId ? 1 : 0) + (personaId ? 1 : 0) + materialIds.length
    : (productId ? 1 : 0) + (discoverSelection ? 1 : 0) + (isAdvisor && referenceTask ? 1 : 0);

  function chooseWorkspaceProduct(id: string | null) {
    onProductChange(id);
    if (id && !isCreative) onDiscoverSelectionChange(null);
  }

  function chooseDiscoverProduct(product: DiscoverOption) {
    const selected = discoverSelection?.productId === product.productId && discoverSelection.region === product.region;
    onDiscoverSelectionChange(
      selected
        ? null
        : {
            productId: product.productId,
            region: product.region,
            name: product.nameZh || product.name,
            coverUrl: product.coverUrls?.[0] ?? null,
          },
    );
    if (!selected) onProductChange(null);
  }

  function toggleMaterial(id: string) {
    if (materialIds.includes(id)) {
      onMaterialIdsChange(materialIds.filter((current) => current !== id));
      return;
    }
    if (materialIds.length >= maxMaterials) {
      toast(`最多选择 ${maxMaterials} 张参考素材`);
      return;
    }
    onMaterialIdsChange(isListing ? [...materialIds, id] : [id]);
  }

  const filteredMaterials = (materials ?? []).filter(
    (m) => !search.trim() || m.originalName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <DialogShell onClose={onClose} labelledBy="asset-picker-title" panelClassName="flex max-h-[88vh] max-w-2xl flex-col p-5">
      {/* 头部 */}
      <div className="mb-4 flex items-center pr-10">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--dk-surface-2)] text-zinc-600">
            <ImagePlus className="h-4 w-4" />
          </span>
          <div>
            <h2 id="asset-picker-title" className="text-sm font-semibold text-ink">
              添加上下文
            </h2>
            <div className="text-2xs text-zinc-500">
              {isListing
                ? "可选一个商品、多张商品/细节图与一位模特"
                : isAdvisor
                  ? "选商品或已有分析，让顾问结合真实上下文回答"
                  : isAnalyst
                    ? "选一个工作台或发现商品，直接做单品判断"
                    : allowVideo
                      ? "选商品、模特，上传参考图；也可传一段实拍视频作成片开场（真货镜头）"
                      : "选商品、模特，或上传一张参考图"}
            </div>
          </div>
        </div>
      </div>

      {/* 已选托盘 */}
      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--dk-surface-2)] p-2">
          <span className="px-1 text-2xs font-medium text-zinc-500">已选 {selectedCount} 项</span>
          {selectedProduct && (
            <SelectedChip
              icon={Package}
              thumb={selectedProduct.coverUrl ?? undefined}
              label={selectedProduct.title}
              onRemove={() => chooseWorkspaceProduct(null)}
            />
          )}
          {!isCreative && discoverSelection && (
            <SelectedChip
              icon={Compass}
              thumb={discoverSelection.coverUrl ?? undefined}
              label={`${discoverSelection.region} · ${discoverSelection.name}`}
              onRemove={() => onDiscoverSelectionChange(null)}
            />
          )}
          {isAdvisor && referenceTask && (
            <SelectedChip
              icon={BarChart3}
              label={`${referenceTask.agent} · ${referenceTask.input}`}
              onRemove={() => onReferenceTaskChange(null)}
            />
          )}
          {selectedPersona && (
            <SelectedChip
              thumb={selectedPersona.avatarUrl ?? undefined}
              label={selectedPersona.name}
              onRemove={() => onPersonaChange(null)}
            />
          )}
          {selectedMaterials.map((material) => (
            <SelectedChip
              key={material.id}
              thumb={material.type === "VIDEO" ? undefined : material.url}
              icon={material.type === "VIDEO" ? Clapperboard : undefined}
              label={material.type === "VIDEO" ? "实拍片段" : material.originalName || "参考图"}
              onRemove={() => toggleMaterial(material.id)}
            />
          ))}
        </div>
      )}

      {/* tab 栏 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon}>
            {t.label}
          </TabButton>
        ))}
      </div>

      {/* tab 内容 */}
      <div className="min-h-[16rem] flex-1 overflow-y-auto">
        {tab === "upload" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-[var(--dk-stroke-border)] px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                从本地上传
              </button>
              <div className="flex h-9 flex-1 items-center gap-1.5 rounded-xl border border-[var(--dk-stroke-border)] bg-white px-2.5 focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100/60">
                <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索素材…"
                  className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-400"
                />
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={allowVideo ? "image/*,video/*" : "image/*"}
              multiple={isListing}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) handleUpload(files);
                e.target.value = "";
              }}
            />
            {materials === null ? (
              <Loading />
            ) : filteredMaterials.length === 0 ? (
              search.trim() ? (
                <EmptyHint text="没有匹配的素材" />
              ) : (
                <EmptyLink href="/app/assets/materials" label="素材库还是空的，去上传几张 →" />
              )
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {filteredMaterials.map((m) => {
                  const sel = materialIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMaterial(m.id)}
                      title={m.originalName}
                      className={`relative aspect-square overflow-hidden rounded-xl border ${sel ? "border-brand-500 ring-2 ring-brand-200" : "border-[var(--dk-stroke-border)]"}`}
                    >
                      {m.type === "VIDEO" ? (
                        <>
                          <video src={m.url} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                          <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white">
                            <Clapperboard className="h-2.5 w-2.5" /> 实拍
                          </span>
                        </>
                      ) : (
                        <Image src={m.url} alt={m.originalName} fill sizes="96px" unoptimized className="object-cover" />
                      )}
                      {sel && (
                        <span className="absolute inset-0 flex items-center justify-center bg-brand-500/40">
                          <Check className="h-4 w-4 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "product" && (
          <>
            {products === null ? (
              <Loading />
            ) : products.length === 0 ? (
              <EmptyLink href="/app/discover/favorites" label="收藏里还没有商品，去挑几个 →" />
            ) : (
              <div className="space-y-1">
                {products.map((p) => {
                  const sel = productId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => chooseWorkspaceProduct(sel ? null : p.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                        sel ? "bg-[var(--dk-action-regular)] ring-1 ring-[var(--dk-stroke-border)]" : "hover:bg-[var(--dk-action-regular)]"
                      }`}
                    >
                      {p.coverUrl ? (
                        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--dk-stroke-border)]">
                          <Image src={p.coverUrl} alt="" fill sizes="36px" unoptimized className="object-cover" />
                        </span>
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--dk-surface-2)] text-zinc-400">
                          {p.emoji ?? <Package className="h-4 w-4" />}
                        </span>
                      )}
                      <span className="flex-1 truncate">{p.title}</span>
                      <span className="font-mono text-2xs text-zinc-400">ROI {p.roiScore}</span>
                      {sel && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
                <p className="px-2 pt-1 text-2xs text-zinc-400">
                  {isListing
                    ? "商品档案和主图会用于 Listing；再选模特会自动附加上身图。"
                    : isAdvisor
                      ? "商品档案会作为顾问本次回答的事实上下文。"
                      : isAnalyst
                        ? "将直接判断这个商品，而不是从默认榜单重新选品。"
                        : "选中商品会把它的真实数据（售价/毛利/ROI/月销）注入产出。"}
                </p>
              </div>
            )}
          </>
        )}

        {tab === "discover" && (isAdvisor || isAnalyst) && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={discoverRegion}
                onChange={(event) => setDiscoverRegion(event.target.value as Region)}
                className="h-9 rounded-xl border border-[var(--dk-stroke-border)] bg-white px-2 text-xs text-zinc-600 outline-none focus:border-brand-300"
                aria-label="发现商品市场"
              >
                {REGIONS.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.flag} {region.cn}
                  </option>
                ))}
              </select>
              <div className="flex h-9 flex-1 items-center gap-1.5 rounded-xl border border-[var(--dk-stroke-border)] bg-white px-2.5 focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100/60">
                <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <input
                  value={discoverSearch}
                  onChange={(event) => setDiscoverSearch(event.target.value)}
                  placeholder="搜索发现商品…"
                  className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-400"
                />
              </div>
            </div>
            {discoverProducts === null ? (
              <Loading />
            ) : discoverProducts.length === 0 ? (
              <EmptyLink href={`/app/discover/products?region=${discoverRegion}`} label="没有匹配商品，去发现页看看 →" />
            ) : (
              <div className="space-y-1">
                {discoverProducts.map((product) => {
                  const selected = discoverSelection?.productId === product.productId && discoverSelection.region === product.region;
                  const name = product.nameZh || product.name;
                  return (
                    <button
                      key={`${product.region}-${product.productId}`}
                      onClick={() => chooseDiscoverProduct(product)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${selected ? "bg-[var(--dk-action-regular)] ring-1 ring-[var(--dk-stroke-border)]" : "hover:bg-[var(--dk-action-regular)]"}`}
                    >
                      {product.coverUrls?.[0] ? (
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-[var(--dk-stroke-border)]">
                          <Image src={product.coverUrls[0]} alt="" fill sizes="40px" unoptimized className="object-cover" />
                        </span>
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--dk-surface-2)] text-zinc-400">
                          <Package className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{name}</span>
                        <span className="mt-0.5 block text-2xs text-zinc-400">
                          {product.region} · ${Math.round(product.avgPriceCents / 100)} · 佣金 {product.commissionRate.toFixed(1)}% · 销量{" "}
                          {product.totalSaleCnt.toLocaleString()}
                        </span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "analysis" && isAdvisor && (
          <>
            {analysisTasks === null ? (
              <Loading />
            ) : analysisTasks.length === 0 ? (
              <EmptyHint text="还没有可引用的选品或投放分析" />
            ) : (
              <div className="space-y-1">
                {analysisTasks.map((task) => {
                  const selected = referenceTask?.id === task.id;
                  return (
                    <button
                      key={task.id}
                      onClick={() =>
                        onReferenceTaskChange(
                          selected
                            ? null
                            : {
                                id: task.id,
                                agent: task.agent,
                                input: task.input,
                              },
                        )
                      }
                      className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors ${selected ? "bg-[var(--dk-action-regular)] ring-1 ring-[var(--dk-stroke-border)]" : "hover:bg-[var(--dk-action-regular)]"}`}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--dk-surface-2)] text-zinc-500">
                        <BarChart3 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">{task.input}</span>
                        <span className="mt-1 line-clamp-2 text-2xs leading-4 text-zinc-500">{task.output}</span>
                        <span className="mt-1 block text-2xs text-zinc-400">{task.agent === "REVIEW" ? "投放复盘" : "选品分析"}</span>
                      </span>
                      {selected && <Check className="mt-2 h-3.5 w-3.5 shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "model" && showModel && (
          <>
            {personas === null ? (
              <Loading />
            ) : personas.length === 0 ? (
              <EmptyLink href="/app/assets/models" label="还没有模特，去模特库看看 →" />
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {personas.map((m) => {
                  const sel = personaId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onPersonaChange(sel ? null : m.id)}
                      title={m.style ?? undefined}
                      className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border bg-[var(--dk-surface-2)] ${
                        sel ? "border-brand-500 ring-2 ring-brand-200" : "border-[var(--dk-stroke-border)]"
                      }`}
                    >
                      {m.avatarUrl ? (
                        <Image src={m.avatarUrl} alt={m.name} fill sizes="96px" unoptimized className="object-cover" />
                      ) : (
                        <UserRound className="h-5 w-5 text-zinc-400" />
                      )}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-center text-2xs text-white">
                        {m.name}
                      </span>
                      {sel && (
                        <span className="absolute inset-0 flex items-center justify-center bg-brand-500/30">
                          <Check className="h-4 w-4 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部 */}
      <div className="mt-4 flex items-center justify-end border-t border-[var(--dk-stroke-border)] pt-3">
        <Button variant="primary" size="sm" onClick={onClose}>
          完成
        </Button>
      </div>
    </DialogShell>
  );
}

function SelectedChip({
  icon: Icon,
  thumb,
  label,
  onRemove,
}: {
  icon?: typeof Package;
  thumb?: string;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white py-1 pl-1.5 pr-1 text-2xs font-medium text-brand-700">
      {thumb ? (
        <span className="relative h-4 w-4 overflow-hidden rounded-full">
          <Image src={thumb} alt="" fill sizes="16px" unoptimized className="object-cover" />
        </span>
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5" />
      ) : null}
      <span className="max-w-32 truncate">{label}</span>
      <button
        onClick={onRemove}
        className="rounded-full p-0.5 text-brand-400 hover:bg-[var(--dk-action-regular)] hover:text-brand-700"
        aria-label="移除"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Upload;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--dk-action-regular)] text-zinc-900 ring-1 ring-[var(--dk-stroke-border)]"
          : "border border-[var(--dk-stroke-border)] bg-white text-zinc-600 hover:bg-[var(--dk-action-regular)] hover:text-zinc-900"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function Loading() {
  return <div className="py-10 text-center text-xs text-zinc-400">加载中…</div>;
}

function EmptyHint({ text }: { text: string }) {
  return <div className="py-10 text-center text-xs text-zinc-400">{text}</div>;
}

function EmptyLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-dashed border-[var(--dk-stroke-border)] py-8 text-center text-xs text-zinc-500 transition-colors hover:border-brand-300 hover:text-brand-600"
    >
      {label}
    </Link>
  );
}
