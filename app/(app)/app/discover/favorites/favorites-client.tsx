"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { initial, stringToGradient } from "../_components/format";
import { Bookmark, Package, Store, Users, Clapperboard } from "lucide-react";
import { ProductsClient, type Product } from "../../assets/products/products-client";

// 非商品收藏（店铺/达人/视频）。商品收藏已并入选品 products 表，走 ProductsClient。
export type FavoriteItem = {
  kind: "seller" | "influencer" | "video";
  externalId: string;
  region: string;
  name: string;
  cover: string;
  subtitle: string;
  metric: string;
  href: string;
  createdAt: string;
};

type TabKey = "product" | "seller" | "influencer" | "video";

function Img({ src, seed, className }: { src: string; seed: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center text-white font-semibold ${className}`}
        style={{ background: stringToGradient(seed) }}
      >
        {initial(seed)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} loading="lazy" onError={() => setFailed(true)} />;
}

function EntityGrid({ items, rounded }: { items: FavoriteItem[]; rounded?: boolean }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="这里还没有收藏"
        description="在店铺 / 达人 / 视频详情页点「收藏」，就会出现在这里。"
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <Link
          key={`${it.kind}-${it.externalId}`}
          href={it.href}
          className="group dk-card dk-lift flex items-center gap-3 p-2.5"
        >
          <Img
            src={it.cover}
            seed={it.name}
            className={`h-12 w-12 flex-shrink-0 object-cover bg-zinc-100 ${rounded ? "rounded-full" : "rounded-md"}`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-900 group-hover:text-brand-600" title={it.name}>
              {it.name || "—"}
            </div>
            {it.subtitle && (
              <div className="mt-0.5 truncate text-2xs text-zinc-500">{it.subtitle}</div>
            )}
          </div>
          {it.metric && <Badge tone="neutral">{it.metric}</Badge>}
        </Link>
      ))}
    </div>
  );
}

// 收藏总入口：商品收藏走选品 products 全能力（状态/成本/做视频），店铺/达人/视频走轻量卡片。
export function FavoritesClient({
  workspaceId,
  products,
  favorites,
}: {
  workspaceId: string;
  products: Product[];
  favorites: FavoriteItem[];
}) {
  const [tab, setTab] = useState<TabKey>("product");

  const counts: Record<TabKey, number> = {
    // 自建商品移到「资产 · 我的商品」，收藏页只计 EchoTik 收藏。
    product: products.filter((p) => p.discoverProductId).length,
    seller: favorites.filter((f) => f.kind === "seller").length,
    influencer: favorites.filter((f) => f.kind === "influencer").length,
    video: favorites.filter((f) => f.kind === "video").length,
  };

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "product", label: "商品", icon: Package },
    { key: "seller", label: "店铺", icon: Store },
    { key: "influencer", label: "达人", icon: Users },
    { key: "video", label: "视频", icon: Clapperboard },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-brand-500" />
            收藏
          </span>
        }
        description="把看中的商品、店铺、达人、视频收在一处。商品收藏可推进阶段、回填成本、直接做视频。"
      />

      <div className="flex items-center gap-1 border-b border-[var(--dk-stroke-divider)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-brand-600 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              <span className={`text-2xs ${active ? "text-brand-400" : "text-zinc-400"}`}>{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      {tab === "product" ? (
        <ProductsClient embedded scope="discover" workspaceId={workspaceId} initialProducts={products} />
      ) : (
        <EntityGrid items={favorites.filter((f) => f.kind === tab)} rounded={tab === "influencer"} />
      )}
    </div>
  );
}
