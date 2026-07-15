"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Plus,
  Trash2,
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
import { DialogShell } from "@/components/ui/Dialog";
import { FieldLabel, Input } from "@/components/ui/Field";
import { EmptyState as EmptyStatePrimitive } from "@/components/ui/EmptyState";
import { useAuthModal } from "@/components/auth/AuthModalProvider";

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

const platformMeta: Record<Platform, { cn: string; available: boolean }> = {
  TIKTOK_SHOP: { cn: "TikTok Shop", available: true },
  AMAZON: { cn: "Amazon", available: false },
  SHOPIFY: { cn: "Shopify", available: false },
  LAZADA: { cn: "Lazada", available: false },
  SHOPEE: { cn: "Shopee", available: false },
  TEMU: { cn: "Temu", available: false },
  OTHER: { cn: "其他", available: true },
};

const statusMeta: Record<Status, { cn: string; cls: string }> = {
  CONNECTED: { cn: "已连接", cls: "bg-emerald-50 text-emerald-700" },
  PENDING: { cn: "待对接", cls: "bg-amber-50 text-amber-700" },
  DISCONNECTED: { cn: "已断开", cls: "bg-[var(--dk-surface-2)] text-zinc-500" },
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
  const { open: openAuthModal } = useAuthModal();

  // 营收/订单/转化看板只在真有店铺 OAuth 连上（CONNECTED）时显示;
  // 当前无真实平台对接，一律 PENDING → 看板隐藏，避免永远 0 的伪 dashboard。
  const hasMetrics = shops.some((s) => s.status === "CONNECTED");

  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可绑定店铺",
      desc: "店铺库需要账号，登录后绑定的 TikTok Shop 会保存在工作台。",
    });
    return true;
  }

  async function deleteShop(id: string) {
    if (!confirm("删除该店铺？相关商品会保留但解绑。")) return;
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/shops/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setShops((prev) => prev.filter((s) => s.id !== id));
      toast.success("店铺已删除");
      router.refresh();
    } else {
      toast.error("删除失败，稍后再试");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="店铺"
        description="登记你绑定的店铺，Agent 的选品 / 复盘报告会自动归到对应店铺。真实平台对接（OAuth 自动同步订单 / 营收）开发中。"
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

      {hasMetrics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="总营收" value={`¥${(totals.revenueCents / 100).toLocaleString()}`} icon={TrendingUp} tone="brand" />
          <StatCard label="订单数" value={totals.orders.toLocaleString()} icon={ShoppingCart} tone="violet" />
          <StatCard label="已售商品" value={totals.itemsSold.toLocaleString()} icon={Package} tone="fuchsia" />
          <StatCard label="访客" value={totals.visitors.toLocaleString()} icon={Users} tone="emerald" />
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--dk-stroke-overlay)] bg-[var(--dk-surface-2)] p-3.5 text-xs text-zinc-600">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span className="leading-relaxed">
            营收 / 订单 / 转化看板将在店铺 <span className="font-medium text-zinc-900">OAuth 自动同步</span> 上线后开放（开发中）。当前可登记店铺、关联选品,Agent 的报告会自动归属到对应店铺。
          </span>
        </div>
      )}

      {shops.length === 0 ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
      ) : (
        <TableWrap minWidth={820}>
            <THead>
              <tr>
                <Th>店铺</Th>
                <Th>平台</Th>
                <Th>国家</Th>
                {hasMetrics && <Th align="right">营收</Th>}
                {hasMetrics && <Th align="right">订单</Th>}
                <Th align="right">商品</Th>
                {hasMetrics && <Th align="right">转化率</Th>}
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
                        <div className="h-9 w-9 rounded-lg bg-[var(--dk-surface-2)] flex items-center justify-center text-zinc-500">
                          <Store className="h-4 w-4" />
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
                    {hasMetrics && (
                      <Td align="right" className="font-semibold">
                        ¥{(s.totalRevenueCents / 100).toLocaleString()}
                      </Td>
                    )}
                    {hasMetrics && <Td align="right">{s.orders.toLocaleString()}</Td>}
                    <Td align="right">{s.productCount}</Td>
                    {hasMetrics && (
                      <Td align="right">
                        {(s.conversionRate * 100).toFixed(1)}%
                      </Td>
                    )}
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
  brand: { fg: "text-brand-600", bg: "bg-brand-50" },
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
    <div className="rounded-lg border border-[var(--dk-stroke-overlay)] bg-white p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]">
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
      description="把你的 TikTok Shop 店铺先登记进来，Agent 的选品 / 复盘报告会自动归到对应店铺。真实平台对接（OAuth 自动同步商品 / 订单 / 营收）开发中。"
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
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/shops`, {
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
      setError(json?.error?.message || "添加失败，稍后再试");
      return;
    }
    onCreated({
      ...json.data.shop,
      createdAt: json.data.shop.createdAt,
      productCount: 0,
    });
  }

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="create-shop-title"
      panelClassName="max-w-md"
    >
      <div className="space-y-5 p-6">
          <div>
            <h2 id="create-shop-title" className="text-subtitle">添加店铺</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">先建立经营档案，后续平台授权与数据会关联到这里。</p>
          </div>

          <div>
            <FieldLabel>平台</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(platformMeta) as Platform[])
                .filter((p) => platformMeta[p].available)
                .map((p) => {
                  const m = platformMeta[p];
                  const active = platform === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      aria-pressed={active}
                      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-all ${
                        active
                          ? "border-brand-300 bg-brand-50/60 text-brand-800 ring-2 ring-brand-100"
                          : "border-[var(--dk-stroke-border)] bg-white text-zinc-600 hover:bg-[var(--dk-action-regular)]"
                      }`}
                    >
                      <span className="text-left">{m.cn}</span>
                    </button>
                  );
                })}
            </div>
            <p className="mt-2 text-2xs text-zinc-400">
              更多平台（Amazon / Shopify / Lazada…）开发中
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="shop-name">店铺名称</FieldLabel>
            <Input
              id="shop-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="例：发现猫 US 旗舰店"
            />
          </div>

          <div>
            <FieldLabel htmlFor="shop-country">
              国家 / 地区（可选）
            </FieldLabel>
            <Input
              id="shop-country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="US / GB / SG / JP …"
              className="font-mono uppercase"
            />
          </div>

          <div className="rounded-xl border border-[var(--dk-stroke-overlay)] bg-[var(--dk-surface-2)] p-3.5 text-2xs leading-relaxed text-zinc-600">
            真实平台对接（OAuth + 拉取订单 / 商品）正在开发中。
            当前先以「待对接」状态保存，发现猫会把后续生成的 Agent 报告关联到对应店铺。
          </div>

          {error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
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
    </DialogShell>
  );
}
