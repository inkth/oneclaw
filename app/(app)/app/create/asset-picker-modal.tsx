"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  ImagePlus,
  Loader2,
  Package,
  Search,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { Button } from "@/components/ui/Button";
import { DialogShell } from "@/components/ui/Dialog";
import { usePersonas } from "../use-personas";
import type { ComposerKind } from "../agent-composer";

type ProductOption = { id: string; title: string; emoji?: string | null; roiScore: number; coverUrl?: string | null };
type MaterialOption = { id: string; type: string; url: string; originalName: string };

type TabKey = "upload" | "product" | "model";

/**
 * 资产选择弹窗：把原先散在 composer 底栏的 商品 / 出镜人设 / 素材 三个 picker
 * 合并到一个带 tab 的弹窗里（上传资产 / 商品 / 模特）。
 * 选择仍按类型单选（≤1 商品 + ≤1 模特 + ≤1 参考图），写回 Workbench 持有的状态,
 * 保住后端「商品=注入真实数据 / 人设=第一人称 / 素材=参考图」语义。
 * 模特 tab 仅短视频（DIRECTOR）/ 虚拟试穿（TRYON）出现。
 */
export function AssetPickerModal({
  workspaceId,
  activeAgent,
  productId,
  onProductChange,
  personaId,
  onPersonaChange,
  materialId,
  onMaterialChange,
  tryOn,
  onClose,
}: {
  workspaceId: string;
  activeAgent: ComposerKind;
  productId: string | null;
  onProductChange: (id: string | null) => void;
  personaId: string | null;
  onPersonaChange: (id: string | null) => void;
  materialId: string | null;
  onMaterialChange: (id: string | null) => void;
  /** 试穿子模式：显式开启「模特 + 服饰图」语义（此时 activeAgent 仍是 LISTING）。 */
  tryOn?: boolean;
  onClose: () => void;
}) {
  // 虚拟试穿现为 Listing 的「上身图」子模式：由 tryOn 显式驱动（activeAgent 仍是 LISTING）。
  // 模特 tab:短视频出镜人设 + 虚拟试穿模特都用它。
  const isTryOn = tryOn ?? activeAgent === "TRYON";
  const showModel = activeAgent === "DIRECTOR" || isTryOn;
  const tabs: { key: TabKey; label: string; icon: typeof Upload }[] = [
    { key: "upload", label: "上传资产", icon: Upload },
    { key: "product", label: "商品", icon: Package },
    ...(showModel ? [{ key: "model" as const, label: "模特", icon: UserRound }] : []),
  ];
  // 试穿先选模特（主图作服饰可后选）;其余 Agent 默认进上传 tab。
  const [tab, setTab] = useState<TabKey>(isTryOn ? "model" : "upload");

  const personas = usePersonas(workspaceId, showModel);
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[] | null>(null);

  // 商品 + 素材库一次性拉（弹窗按需打开，挂载即拉）。
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    apiBrowser<{ products: ProductOption[] }>(`/workspaces/${workspaceId}/products`)
      .then((d) => alive && setProducts(d.products ?? []))
      .catch(() => alive && setProducts([]));
    apiBrowser<{ materials: MaterialOption[] }>(`/workspaces/${workspaceId}/materials`)
      .then((d) => alive && setMaterials((d.materials ?? []).filter((m) => m.type === "IMAGE")))
      .catch(() => alive && setMaterials([]));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  // ── 上传资产 ──
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials`, { method: "POST", body: form });
      const json = await res.json();
      if (res.ok && json.ok) {
        const mat = json.data.material as MaterialOption;
        setMaterials((prev) => [mat, ...(prev ?? [])]);
        onMaterialChange(mat.id);
      } else {
        toast.error(json?.error?.message ?? "上传失败，稍后再试");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误，请检查网络后重试");
    } finally {
      setUploading(false);
    }
  }

  const selectedProduct = products?.find((p) => p.id === productId) ?? null;
  const selectedPersona = personas?.find((m) => m.id === personaId) ?? null;
  const selectedMaterial = materials?.find((m) => m.id === materialId) ?? null;
  const selectedCount = (productId ? 1 : 0) + (personaId ? 1 : 0) + (materialId ? 1 : 0);

  const filteredMaterials = (materials ?? []).filter(
    (m) => !search.trim() || m.originalName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="asset-picker-title"
      panelClassName="flex max-h-[88vh] max-w-2xl flex-col p-5"
    >
        {/* 头部 */}
        <div className="mb-4 flex items-center pr-10">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--dk-surface-2)] text-zinc-600">
              <ImagePlus className="h-4 w-4" />
            </span>
            <div>
              <h2 id="asset-picker-title" className="text-sm font-semibold text-ink">
                {isTryOn ? "选模特与服饰图" : "添加素材"}
              </h2>
              <div className="text-2xs text-zinc-500">
                {isTryOn
                  ? "选一位模特 + 一张服饰图（上传图 / 商品主图），生成上身效果图"
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
                onRemove={() => onProductChange(null)}
              />
            )}
            {selectedPersona && (
              <SelectedChip
                thumb={selectedPersona.avatarUrl ?? undefined}
                label={selectedPersona.name}
                onRemove={() => onPersonaChange(null)}
              />
            )}
            {selectedMaterial && (
              <SelectedChip
                thumb={selectedMaterial.url}
                label="参考图"
                onRemove={() => onMaterialChange(null)}
              />
            )}
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
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
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
                    const sel = materialId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => onMaterialChange(sel ? null : m.id)}
                        title={m.originalName}
                        className={`relative aspect-square overflow-hidden rounded-xl border ${
                          sel ? "border-brand-500 ring-2 ring-brand-200" : "border-[var(--dk-stroke-border)]"
                        }`}
                      >
                        <Image src={m.url} alt={m.originalName} fill sizes="96px" unoptimized className="object-cover" />
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
                        onClick={() => onProductChange(sel ? null : p.id)}
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
                    {isTryOn
                      ? "选中商品会用它的主图作为试穿服饰图。"
                      : "选中商品会把它的真实数据（售价/毛利/ROI/月销）注入产出。"}
                  </p>
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
          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
          >
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
