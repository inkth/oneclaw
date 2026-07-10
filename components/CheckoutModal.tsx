"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import {
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  Wallet,
} from "lucide-react";

type Plan = "PRO" | "TEAM";
type Period = 1 | 3 | 12;
type Provider = "WECHAT" | "ALIPAY";

type Order = {
  id: string;
  outTradeNo: string;
  amountCents: number;
  plan: Plan;
  periodMonths: Period;
  provider: Provider;
  qrCodeUrl: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED" | "FAILED";
  expiresAt: string;
};

const PROVIDER_META: Record<Provider, { cn: string; color: string; tint: string }> = {
  WECHAT: { cn: "微信支付", color: "bg-emerald-500", tint: "text-emerald-500" },
  ALIPAY: { cn: "支付宝", color: "bg-sky-500", tint: "text-sky-500" },
};

const PERIOD_OPTIONS: Array<{ months: Period; label: string; sub: string }> = [
  { months: 1, label: "1 个月", sub: "" },
  { months: 3, label: "3 个月", sub: "9 折" },
  { months: 12, label: "12 个月", sub: "7.5 折" },
];

export function CheckoutModal({
  plan,
  workspaceId,
  defaultPeriod = 1,
  onClose,
}: {
  plan: Plan;
  workspaceId: string;
  defaultPeriod?: Period;
  onClose: () => void;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [provider, setProvider] = useState<Provider>("WECHAT");
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const planLabel = plan === "PRO" ? "专业版" : "团队版";

  // 价目（与 Go 端 service/billing.go 保持一致）
  const priceCents = useMemo(() => {
    const monthly = plan === "PRO" ? 19900 : 89900;
    const mult = period === 1 ? 1 : period === 3 ? 2.7 : 9;
    return Math.round(monthly * mult);
  }, [plan, period]);

  async function createOrder() {
    setCreating(true);
    setError(null);
    try {
      const data = await apiBrowser<{ order: Order; isMock: boolean }>(
        `/workspaces/${workspaceId}/billing/checkout`,
        {
          method: "POST",
          body: JSON.stringify({ plan, periodMonths: period, provider }),
        },
      );
      setOrder(data.order);
      setIsMock(data.isMock);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下单失败");
    } finally {
      setCreating(false);
    }
  }

  // 轮询订单状态
  useEffect(() => {
    if (!order || order.status !== "PENDING") return;
    const t = setInterval(async () => {
      let o: Order;
      try {
        const d = await apiBrowser<{ order: Order }>(
          `/workspaces/${workspaceId}/billing/orders/${order.id}`,
        );
        o = d.order;
      } catch {
        return;
      }
      if (o.status !== order.status) {
        setOrder(o);
        if (o.status === "PAID") {
          clearInterval(t);
          toast.success("支付成功，已升级方案 🎉");
          setTimeout(() => router.refresh(), 800);
        }
        if (o.status === "EXPIRED") {
          clearInterval(t);
        }
      }
    }, 2500);
    return () => clearInterval(t);
  }, [order, workspaceId, router]);

  async function mockConfirm() {
    if (!order) return;
    setConfirming(true);
    try {
      await apiBrowser(
        `/workspaces/${workspaceId}/billing/orders/${order.id}/mock-confirm`,
        { method: "POST" },
      );
      // 等下一次轮询自动捕获 PAID
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "模拟支付失败");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl dk-overlay overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-zinc-400 hover:bg-[var(--dk-action-regular)] hover:text-zinc-900"
        >
          <X className="h-4 w-4" />
        </button>

        {!order ? (
          // 选档 + 选支付方式
          <div className="p-6 space-y-6">
            <div>
              <div className="text-2xs font-medium uppercase tracking-wider text-brand-600">
                升级到 {planLabel}
              </div>
              <h2 className="mt-1 text-xl font-bold tracking-tight">选择订阅周期</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.months}
                  onClick={() => setPeriod(p.months)}
                  className={`rounded-lg border px-3 py-3 text-center transition-all ${
                    period === p.months
                      ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-200"
                      : "border-zinc-200/80 hover:border-zinc-300"
                  }`}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  {p.sub && (
                    <div className="mt-0.5 text-2xs text-emerald-600 font-medium">
                      {p.sub}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-baseline justify-between rounded-lg bg-zinc-50/80 px-4 py-3">
              <div className="text-xs text-zinc-500">应付金额</div>
              <div>
                <span className="text-2xl font-bold tabular-nums">
                  ¥{(priceCents / 100).toFixed(2)}
                </span>
                <span className="ml-1 text-xs text-zinc-500">CNY</span>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-zinc-700 mb-2">支付方式</div>
              <div className="grid grid-cols-2 gap-2">
                {(["WECHAT", "ALIPAY"] as Provider[]).map((pv) => {
                  const m = PROVIDER_META[pv];
                  const active = provider === pv;
                  return (
                    <button
                      key={pv}
                      onClick={() => setProvider(pv)}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                        active
                          ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-200"
                          : "border-zinc-200/80 hover:border-zinc-300"
                      }`}
                    >
                      <Wallet className={`h-4 w-4 ${m.tint}`} strokeWidth={2.2} />
                      {m.cn}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
                {error}
              </div>
            )}

            <button
              onClick={createOrder}
              disabled={creating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--dk-btn-black)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dk-btn-black-hover)] disabled:opacity-60 transition-colors"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              生成二维码
            </button>

            <p className="text-center text-2xs text-zinc-400">
              支付即视为同意《订阅服务协议》，到期后自动降回 FREE。
            </p>
          </div>
        ) : (
          // 显示二维码 + 轮询
          <div className="p-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-2xs font-medium uppercase tracking-wider text-brand-600">
                  {PROVIDER_META[order.provider].cn} · {order.periodMonths} 个月
                </div>
                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  ¥{(order.amountCents / 100).toFixed(2)}
                </h2>
              </div>
              <div className="text-2xs font-mono text-zinc-400">
                {order.outTradeNo}
              </div>
            </div>

            {order.status === "PAID" ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="text-base font-semibold">支付成功</div>
                <div className="text-xs text-zinc-500">
                  方案已升级到 {planLabel}，正在刷新…
                </div>
              </div>
            ) : order.status === "EXPIRED" ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <div className="text-base font-semibold">二维码已过期</div>
                <button
                  onClick={() => setOrder(null)}
                  className="rounded-lg bg-[var(--dk-btn-black)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dk-btn-black-hover)]"
                >
                  重新下单
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-center rounded-lg bg-white border border-zinc-100 p-5">
                  <QRCodeSVG
                    value={order.qrCodeUrl}
                    size={200}
                    level="M"
                    bgColor="#fff"
                    fgColor="#18181b"
                  />
                </div>
                <div className="text-center text-xs text-zinc-500">
                  请用 <span className="font-medium">{PROVIDER_META[order.provider].cn}</span> 扫描上方二维码完成支付
                </div>
                <div className="flex items-center justify-center gap-2 text-2xs text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  等待回调中…
                </div>

                {isMock && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-2 text-xs text-amber-800">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Mock 支付（dev 模式）</div>
                        <p className="mt-0.5 leading-relaxed">
                          {PROVIDER_META[order.provider].cn} 凭证未配置，二维码是占位符。
                          点下方按钮直接模拟成功，方便联调。
                        </p>
                        <button
                          onClick={mockConfirm}
                          disabled={confirming}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1 text-2xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {confirming && <Loader2 className="h-3 w-3 animate-spin" />}
                          模拟支付成功
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
