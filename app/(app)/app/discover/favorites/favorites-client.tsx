"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { initial, stringToGradient } from "../_components/format";
import { Bookmark, Package, Store, Users, Clapperboard } from "lucide-react";

export type FavoriteItem = {
  kind: "product" | "seller" | "influencer" | "video";
  externalId: string;
  region: string;
  name: string;
  cover: string;
  subtitle: string;
  metric: string;
  href: string;
  createdAt: string;
};

const GROUPS: { kind: FavoriteItem["kind"]; label: string; icon: React.ComponentType<{ className?: string }>; rounded?: boolean }[] = [
  { kind: "product", label: "商品", icon: Package },
  { kind: "seller", label: "店铺", icon: Store },
  { kind: "influencer", label: "达人", icon: Users, rounded: true },
  { kind: "video", label: "视频", icon: Clapperboard },
];

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

export function FavoritesClient({
  items,
  title = "选品 · 我的收藏",
  description = "把看中的商品、店铺、达人、视频收在一处,方便随时回看对比。",
}: {
  items: FavoriteItem[];
  title?: string;
  description?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-brand-500" />
            {title}
          </span>
        }
        description={description}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="还没有收藏"
          description="在商品/店铺/达人/视频详情页点「收藏」,就会出现在这里。"
        />
      ) : (
        GROUPS.map((g) => {
          const group = items.filter((it) => it.kind === g.kind);
          if (group.length === 0) return null;
          const Icon = g.icon;
          return (
            <Card key={g.kind}>
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand-600" />
                <span className="text-sm font-medium text-zinc-900">{g.label}</span>
                <span className="text-xs text-zinc-400">{group.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((it) => (
                  <Link
                    key={`${it.kind}-${it.externalId}`}
                    href={it.href}
                    className="group flex items-center gap-3 rounded-lg border border-zinc-200/70 bg-white p-2.5 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    <Img
                      src={it.cover}
                      seed={it.name}
                      className={`h-12 w-12 flex-shrink-0 object-cover bg-zinc-100 ${g.rounded ? "rounded-full" : "rounded-md"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900 group-hover:text-brand-600" title={it.name}>
                        {it.name || "—"}
                      </div>
                      {it.subtitle && (
                        <div className="mt-0.5 truncate text-2xs text-zinc-500">{it.subtitle}</div>
                      )}
                    </div>
                    {it.metric && (
                      <Badge tone="neutral">{it.metric}</Badge>
                    )}
                  </Link>
                ))}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
