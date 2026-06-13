"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Image as ImageIcon, Package, UserRound, X } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { Popover, ToolbarButton } from "@/components/ui/Popover";
import { usePersonas } from "../use-personas";
import type { ComposerKind } from "../agent-composer";

type ProductOption = {
  id: string;
  title: string;
  emoji?: string | null;
  roiScore: number;
};

type MaterialOption = {
  id: string;
  type: string;
  url: string;
  originalName: string;
};

/**
 * 创作 composer 的工具链:商品 / 出镜人设 / 首帧素材 三个选择器。
 * 列表懒加载(首次展开才拉);选中值由 Workbench 持有,派活成功即清空。
 * 游客点击交给 gate 弹登录,不发请求。
 */
export function AssetChips({
  workspaceId,
  activeAgent,
  productId,
  onProductChange,
  personaId,
  onPersonaChange,
  materialId,
  onMaterialChange,
  gate,
}: {
  workspaceId: string;
  activeAgent: ComposerKind;
  productId: string | null;
  onProductChange: (id: string | null) => void;
  personaId: string | null;
  onPersonaChange: (id: string | null) => void;
  materialId: string | null;
  onMaterialChange: (id: string | null) => void;
  /** 游客拦截:返回 true 表示已弹登录,选择器不展开。 */
  gate: () => boolean;
}) {
  // ── 商品:有接力预选时立即拉(为了显示商品名),否则首次展开才拉 ──
  const [productsWanted, setProductsWanted] = useState(!!productId);
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  useEffect(() => {
    if (!productsWanted || !workspaceId || products !== null) return;
    let alive = true;
    apiBrowser<{ products: ProductOption[] }>(`/workspaces/${workspaceId}/products`)
      .then((d) => {
        if (alive) setProducts(d.products ?? []);
      })
      .catch(() => {
        if (alive) setProducts([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsWanted, workspaceId]);

  // ── 人设(仅短视频):首次展开才拉 ──
  const [personasWanted, setPersonasWanted] = useState(false);
  const personas = usePersonas(workspaceId, personasWanted);

  // ── 素材:首次展开才拉,只取图片(作视频首帧 / 出图参考) ──
  const [materialsWanted, setMaterialsWanted] = useState(false);
  const [materials, setMaterials] = useState<MaterialOption[] | null>(null);
  useEffect(() => {
    if (!materialsWanted || !workspaceId || materials !== null) return;
    let alive = true;
    apiBrowser<{ materials: MaterialOption[] }>(`/workspaces/${workspaceId}/materials`)
      .then((d) => {
        if (alive) setMaterials((d.materials ?? []).filter((m) => m.type === "IMAGE"));
      })
      .catch(() => {
        if (alive) setMaterials([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialsWanted, workspaceId]);

  const selectedProduct = products?.find((p) => p.id === productId) ?? null;
  const selectedPersona = personas?.find((m) => m.id === personaId) ?? null;
  const selectedMaterial = materials?.find((m) => m.id === materialId) ?? null;

  return (
    <>
      {/* 商品 */}
      <GatedPopover
        gate={gate}
        onOpen={() => setProductsWanted(true)}
        trigger={(open) => (
          <ToolbarButton
            icon={Package}
            label={
              selectedProduct
                ? truncate(selectedProduct.title, 12)
                : productId
                  ? "已关联商品"
                  : "商品"
            }
            open={open}
            active={!!productId}
          />
        )}
      >
        {({ close }) =>
          products === null ? (
            <PickerLoading />
          ) : products.length === 0 ? (
            <EmptyPickerHint href="/app/assets/products" label="去选品库挑商品" />
          ) : (
            <div className="max-h-64 w-64 space-y-1 overflow-y-auto">
              {products.map((p) => {
                const sel = productId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onProductChange(sel ? null : p.id);
                      close();
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      sel ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-zinc-50"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className="font-mono text-2xs text-zinc-400">R{p.roiScore}</span>
                    {sel && <Check className="h-3 w-3 shrink-0 text-brand-600" />}
                  </button>
                );
              })}
            </div>
          )
        }
      </GatedPopover>

      {/* 出镜人设:只在短视频创作下出现 */}
      {activeAgent === "DIRECTOR" && (
        <GatedPopover
          gate={gate}
          onOpen={() => setPersonasWanted(true)}
          trigger={(open) => (
            <ToolbarButton
              icon={UserRound}
              label={selectedPersona ? truncate(selectedPersona.name, 8) : "出镜人设"}
              open={open}
              active={!!personaId}
            />
          )}
        >
          {({ close }) =>
            personas === null ? (
              <PickerLoading />
            ) : personas.length === 0 ? (
              <EmptyPickerHint href="/app/assets/models" label="去模特库看看" />
            ) : (
              <div className="grid max-h-64 w-72 grid-cols-3 gap-1.5 overflow-y-auto">
                {personas.map((m) => {
                  const sel = personaId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        onPersonaChange(sel ? null : m.id);
                        close();
                      }}
                      title={m.style ?? undefined}
                      className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border bg-zinc-100 ${
                        sel ? "border-brand-500 ring-2 ring-brand-200" : "border-zinc-200/80"
                      }`}
                    >
                      {m.avatarUrl ? (
                        <Image
                          src={m.avatarUrl}
                          alt={m.name}
                          fill
                          sizes="96px"
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
            )
          }
        </GatedPopover>
      )}

      {/* 首帧素材 */}
      <GatedPopover
        gate={gate}
        onOpen={() => setMaterialsWanted(true)}
        trigger={(open) => (
          <ToolbarButton
            icon={ImageIcon}
            label={selectedMaterial ? "首帧图已选" : "素材"}
            open={open}
            active={!!materialId}
          />
        )}
      >
        {({ close }) => (
          <div className="w-72 space-y-2">
            <div className="text-2xs text-zinc-400">
              {activeAgent === "DIRECTOR"
                ? "选一张实拍图作视频首帧(优先于商品主图)"
                : "选一张实拍图作出图参考(无商品主图时用)"}
            </div>
            {materials === null ? (
              <PickerLoading />
            ) : materials.length === 0 ? (
              <EmptyPickerHint href="/app/assets/materials" label="去素材库上传" />
            ) : (
              <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
                {materials.map((m) => {
                  const sel = materialId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        onMaterialChange(sel ? null : m.id);
                        close();
                      }}
                      title={m.originalName}
                      className={`relative aspect-square overflow-hidden rounded-md border ${
                        sel ? "border-brand-500 ring-2 ring-brand-200" : "border-zinc-200/80"
                      }`}
                    >
                      <Image
                        src={m.url}
                        alt={m.originalName}
                        fill
                        sizes="96px"
                        unoptimized
                        className="object-cover"
                      />
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
      </GatedPopover>

      {/* 已选清除:一个 chip 一键全清,避免误带上一次的资产 */}
      {(productId || personaId || materialId) && (
        <button
          onClick={() => {
            onProductChange(null);
            onPersonaChange(null);
            onMaterialChange(null);
          }}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-2xs text-zinc-400 transition-colors hover:text-zinc-600"
          title="清除已选资产"
        >
          <X className="h-3 w-3" />
          清除
        </button>
      )}
    </>
  );
}

/**
 * 带游客拦截与懒加载的 Popover:点击先过 gate(游客弹登录并阻止展开),
 * 登录态首次点击时通过 onOpen 触发列表拉取。
 */
function GatedPopover({
  gate,
  onOpen,
  trigger,
  children,
}: {
  gate: () => boolean;
  onOpen: () => void;
  trigger: (open: boolean) => React.ReactNode;
  children: (state: { close: () => void }) => React.ReactNode;
}) {
  return (
    <span
      onClickCapture={(e) => {
        if (gate()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onOpen();
      }}
    >
      <Popover align="start" trigger={({ open }) => trigger(open)}>
        {children}
      </Popover>
    </span>
  );
}

function PickerLoading() {
  return <div className="w-56 py-4 text-center text-xs text-zinc-400">加载中…</div>;
}

function EmptyPickerHint({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block w-56 rounded-lg border border-dashed border-zinc-300 py-5 text-center text-xs text-zinc-500 transition-colors hover:border-brand-300 hover:text-brand-600"
    >
      还没有,{label} →
    </Link>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
