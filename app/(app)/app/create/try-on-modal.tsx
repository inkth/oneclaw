"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, Package, Shirt, Upload, UserRound, X } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { CreditCost } from "@/components/ui/CreditCost";
import { CREDIT_COST } from "@/lib/credits";
import { usePersonas } from "../use-personas";
import type { StreamTask } from "../task-stream";

type ProductOption = { id: string; title: string; roiScore: number };

/**
 * 虚拟试穿弹窗:选模特 + 给一张服饰图(上传 / 收藏商品主图)→ 派活 TRYON。
 * 出图异步,结果在任务流(会话)里按 imagesStatus 轮询显示,与 Listing 主图同机制。
 */
export function TryOnModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (task: StreamTask) => void;
}) {
  const personas = usePersonas(workspaceId, true);
  const [modelId, setModelId] = useState<string | null>(null);

  const [tab, setTab] = useState<"upload" | "product">("upload");

  // 上传服饰图 → materialId
  const [uploading, setUploading] = useState(false);
  const [garment, setGarment] = useState<{ materialId: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 收藏商品 → productId(后端取该商品 EchoTik 主图作服饰图)
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [productId, setProductId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("tags", "试穿服饰");
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setGarment({ materialId: json.data.material.id, url: json.data.material.url });
        setProductId(null);
      } else {
        toast.error(json?.error?.message ?? "上传失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setUploading(false);
    }
  }

  function loadProducts() {
    if (products !== null) return;
    apiBrowser<{ products: ProductOption[] }>(`/workspaces/${workspaceId}/products`)
      .then((d) => setProducts(d.products ?? []))
      .catch(() => setProducts([]));
  }

  const hasGarment = tab === "upload" ? !!garment : !!productId;
  const canSubmit = !!modelId && hasGarment && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agent-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "TRYON",
          input: "虚拟试穿",
          modelAssetId: modelId,
          ...(tab === "upload" && garment ? { materialId: garment.materialId } : {}),
          ...(tab === "product" && productId ? { productId } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error?.message ?? "发送失败");
        return;
      }
      const task = (json.data?.task ?? json.task) as StreamTask | undefined;
      if (task) onCreated(task);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="dk-card max-h-[88vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-cyan-400 text-white shadow-sm">
              <Shirt className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">虚拟试穿</div>
              <div className="text-2xs text-zinc-500">选一位模特,给一张服饰图,生成上身效果图</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 第一步:选模特 ── */}
        <div className="mb-2 text-xs font-medium text-zinc-600">1. 选模特</div>
        {personas === null ? (
          <div className="py-6 text-center text-xs text-zinc-400">加载中…</div>
        ) : personas.length === 0 ? (
          <Link
            href="/app/assets/models"
            className="mb-4 block rounded-lg border border-dashed border-zinc-300 py-5 text-center text-xs text-zinc-500 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            还没有模特,去模特库看看 →
          </Link>
        ) : (
          <div className="mb-4 grid grid-cols-4 gap-1.5">
            {personas.map((m) => {
              const sel = modelId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setModelId(sel ? null : m.id)}
                  title={m.name}
                  className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border bg-zinc-100 ${
                    sel ? "border-brand-500 ring-2 ring-brand-200" : "border-zinc-200/80"
                  }`}
                >
                  {m.avatarUrl ? (
                    <Image
                      src={m.avatarUrl}
                      alt={m.name}
                      fill
                      sizes="80px"
                      unoptimized
                      className="object-cover"
                    />
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

        {/* ── 第二步:服饰图 ── */}
        <div className="mb-2 text-xs font-medium text-zinc-600">2. 服饰图(要试穿的衣服)</div>
        <div className="mb-3 flex gap-1.5">
          <TabButton active={tab === "upload"} onClick={() => setTab("upload")} icon={Upload}>
            上传图片
          </TabButton>
          <TabButton
            active={tab === "product"}
            onClick={() => {
              setTab("product");
              loadProducts();
            }}
            icon={Package}
          >
            从收藏取
          </TabButton>
        </div>

        {tab === "upload" ? (
          <div className="mb-4">
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
            {garment ? (
              <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-zinc-200">
                  <Image src={garment.url} alt="服饰" fill sizes="64px" unoptimized className="object-cover" />
                </span>
                <span className="flex-1 text-xs text-zinc-500">服饰图已就绪</span>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-2xs font-medium text-brand-600 hover:text-brand-700"
                >
                  换一张
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 py-6 text-xs text-zinc-500 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                {uploading ? "上传中…" : "点击上传服饰平铺图 / 挂拍图"}
              </button>
            )}
          </div>
        ) : (
          <div className="mb-4">
            {products === null ? (
              <div className="py-6 text-center text-xs text-zinc-400">加载中…</div>
            ) : products.length === 0 ? (
              <Link
                href="/app/discover/favorites"
                className="block rounded-lg border border-dashed border-zinc-300 py-5 text-center text-xs text-zinc-500 transition-colors hover:border-brand-300 hover:text-brand-600"
              >
                收藏里还没有商品,去挑几个 →
              </Link>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {products.map((p) => {
                  const sel = productId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setProductId(sel ? null : p.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        sel ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-zinc-50"
                      }`}
                    >
                      <Package className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                      <span className="flex-1 truncate">{p.title}</span>
                      {sel && <Check className="h-3 w-3 shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
                <p className="px-2 pt-1 text-2xs text-zinc-400">
                  用商品主图作服饰图;无主图的商品会提示换一个。
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 提交 ── */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-3">
          <CreditCost credits={CREDIT_COST.image} />
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-black disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shirt className="h-3.5 w-3.5" />}
            {submitting ? "提交中…" : "生成上身图"}
          </button>
        </div>
      </div>
    </div>
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
