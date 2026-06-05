"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Plus,
  Trash2,
  X,
  Loader2,
  TrendingUp,
  ShoppingCart,
  Package,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState as EmptyStatePrimitive } from "@/components/ui/EmptyState";

type Platform =
  | "TIKTOK_SHOP"
  | "AMAZON"
  | "SHOPIFY"
  | "LAZADA"
  | "SHOPEE"
  | "TEMU"
  | "OTHER";
type Status = "CONNECTED" | "PENDING" | "DISCONNECTED" | "ERROR";

type Shop = {
  id: string;
  name: string;
  platform: Platform;
  country: string | null;
  status: Status;
  totalRevenueCents: number;
  orders: number;
  itemsSold: number;
  visitors: number;
  conversionRate: number;
  productCount: number;
  createdAt: string;
  lastSyncAt: string | null;
};

const platformMeta: Record<Platform, { cn: string; emoji: string; available: boolean }> = {
  TIKTOK_SHOP: { cn: "TikTok Shop", emoji: "🎵", available: true },
  AMAZON: { cn: "Amazon", emoji: "📦", available: false },
  SHOPIFY: { cn: "Shopify", emoji: "🛍️", available: false },
  LAZADA: { cn: "Lazada", emoji: "🛒", available: false },
  SHOPEE: { cn: "Shopee", emoji: "🛍️", available: false },
  TEMU: { cn: "Temu", emoji: "📮", available: false },
  OTHER: { cn: "其他", emoji: "🏬", available: true },
};

const statusMeta: Record<Status, { cn: string; cls: string }> = {
  CONNECTED: { cn: "已连接", cls: "bg-emerald-50 text-emerald-700" },
  PENDING: { cn: "待对接", cls: "bg-amber-50 text-amber-700" },
  DISCONNECTED: { cn: "已断开", cls: "bg-zinc-100 text-zinc-500" },
  ERROR: { cn: "异常", cls: "bg-rose-50 text-rose-700" },
};

export function ShopsClient({
  workspaceId,
  initialShops,
  totals,
  isGuest = false,
}: {
  workspaceId: string;
  initialShops: Shop[];
  totals: { revenueCents: number; orders: number; itemsSold: number; visitors: number };
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [shops, setShops] = useState(initialShops);
  const [modalOpen, setModalOpen] = useState(false);

  function gateGuest(): boolean {
    if (!isGuest) return false;
    toast("登录后即可操作", {
      action: {
        label: "去登录",
        onClick: () => {
          window.location.href = "/login?callbackUrl=/app";
        },
      },
    });
    return true;
  }

  async function deleteShop(id: string) {
    if (!confirm("删除该店铺？相关商品会保留但解绑。")) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/shops/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setShops((prev) => prev.filter((s) => s.id !== id));
      toast.success("店铺已删除");
      router.refresh();
    } else {
      toast.error("删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="店铺"
        description="连接你的电商平台店铺，统一追踪营收、订单、转化率。"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              if (gateGuest()) return;
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            添加店铺
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="总营收" value={`¥${(totals.revenueCents / 100).toLocaleString()}`} icon={TrendingUp} tone="indigo" />
        <StatCard label="订单数" value={totals.orders.toLocaleString()} icon={ShoppingCart} tone="violet" />
        <StatCard label="已售商品" value={totals.itemsSold.toLocaleString()} icon={Package} tone="fuchsia" />
        <StatCard label="访客" value={totals.visitors.toLocaleString()} icon={Users} tone="emerald" />
      </div>

      {shops.length === 0 ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
      ) : (
        <TableWrap minWidth={820}>
            <THead>
              <tr>
                <Th>店铺</Th>
                <Th>平台</Th>
                <Th>国家</Th>
                <Th align="right">营收</Th>
                <Th align="right">订单</Th>
                <Th align="right">商品</Th>
                <Th align="right">转化率</Th>
                <Th align="center">状态</Th>
                <Th align="right">操作</Th>
              </tr>
            </THead>
            <tbody>
              {shops.map((s) => {
                const pm = platformMeta[s.platform];
                return (
                  <Tr key={s.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-zinc-100 flex items-center justify-center text-lg">
                          {pm.emoji}
                        </div>
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-2xs text-zinc-500">
                            {new Date(s.createdAt).toLocaleDateString("zh-CN")} 添加
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-zinc-600">{pm.cn}</Td>
                    <Td className="text-zinc-600">
                      {s.country ?? <span className="text-zinc-300">—</span>}
                    </Td>
                    <Td align="right" className="font-semibold">
                      ¥{(s.totalRevenueCents / 100).toLocaleString()}
                    </Td>
                    <Td align="right">{s.orders.toLocaleString()}</Td>
                    <Td align="right">{s.productCount}</Td>
                    <Td align="right">
                      {(s.conversionRate * 100).toFixed(1)}%
                    </Td>
                    <Td align="center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${statusMeta[s.status].cls}`}>
                        {statusMeta[s.status].cn}
                      </span>
                    </Td>
                    <Td align="right">
                      <button
                        onClick={() => deleteShop(s.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-2xs text-rose-600 hover:bg-rose-100"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
        </TableWrap>
      )}

      {modalOpen && (
        <AddShopModal
          workspaceId={workspaceId}
          onClose={() => setModalOpen(false)}
          onCreated={(s) => {
            setShops((prev) => [s, ...prev]);
            setModalOpen(false);
            toast.success(`已添加：${s.name}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const toneMap = {
  indigo: { fg: "text-indigo-600", bg: "bg-indigo-50" },
  violet: { fg: "text-violet-600", bg: "bg-violet-50" },
  fuchsia: { fg: "text-fuchsia-600", bg: "bg-fuchsia-50" },
  emerald: { fg: "text-emerald-600", bg: "bg-emerald-50" },
} as const;

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof toneMap;
}) {
  const t = toneMap[tone];
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.bg} ${t.fg}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyStatePrimitive
      icon={Store}
      title="还没添加店铺"
      description="连接你的 TikTok Shop / Amazon / Shopify 等平台店铺，OneClaw 会自动同步商品、订单与营收，让 Agent 的选品和投放决策都有数据兜底。"
      action={
        <Button variant="primary" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          添加第一个店铺
        </Button>
      }
    />
  );
}

function AddShopModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (s: Shop) => void;
}) {
  const [platform, setPlatform] = useState<Platform>("TIKTOK_SHOP");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("请填写店铺名称");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/shops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        platform,
        country: country.trim() || undefined,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      setError(json?.error?.message || "添加失败");
      return;
    }
    onCreated({
      ...json.data.shop,
      createdAt: json.data.shop.createdAt,
      productCount: 0,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 space-y-5">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">添加店铺</h2>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-2">平台</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(platformMeta) as Platform[]).map((p) => {
                const m = platformMeta[p];
                const active = platform === p;
                return (
                  <button
                    key={p}
                    onClick={() => m.available && setPlatform(p)}
                    disabled={!m.available}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                      active
                        ? "border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-200"
                        : "border-zinc-200/80 hover:border-zinc-300"
                    } ${!m.available ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <span>{m.emoji}</span>
                    <span className="text-left">
                      {m.cn}
                      {!m.available && (
                        <span className="ml-1 text-2xs text-zinc-400">敬请期待</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">店铺名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="例：OneClaw US 旗舰店"
              className="w-full rounded-lg border border-zinc-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              国家 / 地区（可选）
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="US / GB / SG / JP …"
              className="w-full rounded-lg border border-zinc-200/80 px-3 py-2 text-sm outline-none font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            />
          </div>

          <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3 text-2xs text-zinc-600 leading-relaxed">
            🔌 真实平台对接（OAuth + 拉取订单 / 商品）正在开发中。
            当前先以「待对接」状态保存，OneClaw 会把后续生成的 Agent 报告关联到对应店铺。
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
              {error}
            </div>
          )}

          <Button
            variant="primary"
            onClick={submit}
            disabled={submitting}
            className="w-full"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
