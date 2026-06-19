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
  Sparkles,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { CreditCost } from "@/components/ui/CreditCost";
import { CREDIT_COST } from "@/lib/credits";
import { usePersonas } from "../use-personas";
import type { ComposerKind } from "../agent-composer";

type ProductOption = { id: string; title: string; emoji?: string | null; roiScore: number; coverUrl?: string | null };
type MaterialOption = { id: string; type: string; url: string; originalName: string };

type TabKey = "upload" | "generate" | "product" | "model";

/**
 * 资产选择弹窗:把原先散在 composer 底栏的 商品 / 出镜人设 / 素材 三个 picker
 * 合并到一个带 tab 的弹窗里(上传资产 / AI 生成 / 商品 / 模特)。
 * 选择仍按类型单选(≤1 商品 + ≤1 模特 + ≤1 参考图),写回 Workbench 持有的状态,
 * 保住后端「商品=注入真实数据 / 人设=第一人称 / 素材=参考图」语义。
 * 模特 tab 仅短视频(DIRECTOR)出现;AI 生成走 /materials/generate 端点出图后选用。
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
  onClose: () => void;
}) {
  const showModel = activeAgent === "DIRECTOR";
  const tabs: { key: TabKey; label: string; icon: typeof Upload }[] = [
    { key: "upload", label: "上传资产", icon: Upload },
    { key: "generate", label: "AI 生成", icon: Sparkles },
    { key: "product", label: "商品", icon: Package },
    ...(showModel ? [{ key: "model" as const, label: "模特", icon: UserRound }] : []),
  ];
  const [tab, setTab] = useState<TabKey>("upload");

  const personas = usePersonas(workspaceId, showModel);
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[] | null>(null);

  // 商品 + 素材库一次性拉(弹窗按需打开,挂载即拉)。
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
        toast.error(json?.error?.message ?? "上传失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setUploading(false);
    }
  }

  // ── AI 生成 ──
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    const p = genPrompt.trim();
    if (!p || generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        const mat = json.data.material as MaterialOption;
        setMaterials((prev) => [mat, ...(prev ?? [])]);
        onMaterialChange(mat.id);
        setGenPrompt("");
        setTab("upload"); // 切到素材区,新图已被选中
        toast.success("参考图已生成并选用");
      } else {
        toast.error(json?.error?.message ?? "生成失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setGenerating(false);
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="dk-card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-sm">
              <ImagePlus className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">添加素材</div>
              <div className="text-2xs text-zinc-500">选商品、模特,或上传 / AI 生成一张参考图</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 已选托盘 */}
        {selectedCount > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-zinc-50 p-2">
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
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  从本地上传
                </button>
                <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-2">
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
                  <EmptyLink href="/app/assets/materials" label="素材库还是空的,去上传几张 →" />
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
                        className={`relative aspect-square overflow-hidden rounded-md border ${
                          sel ? "border-brand-500 ring-2 ring-brand-200" : "border-zinc-200/80"
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

          {tab === "generate" && (
            <div className="space-y-3">
              <textarea
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                rows={4}
                placeholder="描述想要的参考图,例:极简白底面霜产品图,柔和自然光,无文字水印"
                className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-brand-400"
              />
              <div className="flex items-center justify-between">
                <CreditCost credits={CREDIT_COST.image} />
                <button
                  onClick={handleGenerate}
                  disabled={!genPrompt.trim() || generating}
                  className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-black disabled:pointer-events-none disabled:opacity-50"
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {generating ? "生成中…" : "生成参考图"}
                </button>
              </div>
              <p className="text-2xs text-zinc-400">出图约 10–60 秒,完成后自动选用为参考图(消耗出图额度)。</p>
            </div>
          )}

          {tab === "product" && (
            <>
              {products === null ? (
                <Loading />
              ) : products.length === 0 ? (
                <EmptyLink href="/app/discover/favorites" label="收藏里还没有商品,去挑几个 →" />
              ) : (
                <div className="space-y-1">
                  {products.map((p) => {
                    const sel = productId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onProductChange(sel ? null : p.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          sel ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-zinc-50"
                        }`}
                      >
                        {p.coverUrl ? (
                          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-zinc-200/80">
                            <Image src={p.coverUrl} alt="" fill sizes="36px" unoptimized className="object-cover" />
                          </span>
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-base">
                            {p.emoji ?? "📦"}
                          </span>
                        )}
                        <span className="flex-1 truncate">{p.title}</span>
                        <span className="font-mono text-2xs text-zinc-400">R{p.roiScore}</span>
                        {sel && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                      </button>
                    );
                  })}
                  <p className="px-2 pt-1 text-2xs text-zinc-400">选中商品会把它的真实数据(售价/毛利/ROI/月销)注入产出。</p>
                </div>
              )}
            </>
          )}

          {tab === "model" && showModel && (
            <>
              {personas === null ? (
                <Loading />
              ) : personas.length === 0 ? (
                <EmptyLink href="/app/assets/models" label="还没有模特,去模特库看看 →" />
              ) : (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {personas.map((m) => {
                    const sel = personaId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => onPersonaChange(sel ? null : m.id)}
                        title={m.style ?? undefined}
                        className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border bg-zinc-100 ${
                          sel ? "border-brand-500 ring-2 ring-brand-200" : "border-zinc-200/80"
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
        <div className="mt-4 flex items-center justify-end border-t border-zinc-100 pt-3">
          <button
            onClick={onClose}
            className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-black"
          >
            完成
          </button>
        </div>
      </div>
    </div>
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
        className="rounded-full p-0.5 text-brand-400 hover:bg-brand-100 hover:text-brand-700"
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
          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
          : "border border-black/10 bg-white text-zinc-600 hover:border-black/20"
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
      className="block rounded-lg border border-dashed border-zinc-300 py-8 text-center text-xs text-zinc-500 transition-colors hover:border-brand-300 hover:text-brand-600"
    >
      {label}
    </Link>
  );
}
