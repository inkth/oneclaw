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
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">店铺</h1>
          <p className="mt-1 text-sm text-zinc-500">
            连接你的电商平台店铺，统一追踪营收、订单、转化率。
          </p>
        </div>
        <button
          onClick={() => {
            if (gateGuest()) return;
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          添加店铺
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="总营收" value={`¥${(totals.revenueCents / 100).toLocaleString()}`} icon={TrendingUp} tone="indigo" />
        <StatCard label="订单数" value={totals.orders.toLocaleString()} icon={ShoppingCart} tone="violet" />
        <StatCard label="已售商品" value={totals.itemsSold.toLocaleString()} icon={Package} tone="fuchsia" />
        <StatCard label="访客" value={totals.visitors.toLocaleString()} icon={Users} tone="emerald" />
      </div>

      {shops.length === 0 ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-zinc-50/60 text-xs text-zinc-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">店铺</th>
                <th className="text-left font-medium px-4 py-3">平台</th>
                <th className="text-left font-medium px-4 py-3">国家</th>
                <th className="text-right font-medium px-4 py-3">营收</th>
                <th className="text-right font-medium px-4 py-3">订单</th>
                <th className="text-right font-medium px-4 py-3">商品</th>
                <th className="text-right font-medium px-4 py-3">转化率</th>
                <th className="text-center font-medium px-4 py-3">状态</th>
                <th className="text-right font-medium px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {shops.map((s) => {
                const pm = platformMeta[s.platform];
                return (
                  <tr key={s.id} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-lg">
                          {pm.emoji}
                        </div>
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-[11px] text-zinc-500">
                            {new Date(s.createdAt).toLocaleDateString("zh-CN")} 添加
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{pm.cn}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {s.country ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      ¥{(s.totalRevenueCents / 100).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.orders.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.productCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(s.conversionRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta[s.status].cls}`}>
                        {statusMeta[s.status].cn}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteShop(s.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-100"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.bg} ${t.fg}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-4">
        <Store className="h-5 w-5" />
      </div>
      <div className="text-base font-semibold">还没添加店铺</div>
      <p className="mt-1.5 text-sm text-zinc-500 max-w-md mx-auto">
        连接你的 TikTok Shop / Amazon / Shopify 等平台店铺，OneClaw 会自动同步商品、订单与营收，
        让 Agent 的选品和投放决策都有数据兜底。
      </p>
      <button
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        <Plus className="h-4 w-4" />
        添加第一个店铺
      </button>
    </div>
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
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 space-y-5">
          <h2 className="text-lg font-bold tracking-tight">添加店铺</h2>

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
                        : "border-zinc-200 hover:border-zinc-300"
                    } ${!m.available ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <span>{m.emoji}</span>
                    <span className="text-left">
                      {m.cn}
                      {!m.available && (
                        <span className="ml-1 text-[9px] text-zinc-400">敬请期待</span>
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
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
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
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            />
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 text-[11px] text-zinc-600 leading-relaxed">
            🔌 真实平台对接（OAuth + 拉取订单 / 商品）正在开发中。
            当前先以「待对接」状态保存，OneClaw 会把后续生成的 Agent 报告关联到对应店铺。
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
