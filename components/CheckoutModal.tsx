"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import {
  ArrowRight,
  Bot,
  Check,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Coins,
  Crown,
  ShieldCheck,
  Sparkles,
  Video,
  Workflow,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DialogShell } from "@/components/ui/Dialog";
import { BrandLockup } from "@/components/ui/BrandMark";
import { BRAND_SLOGAN } from "@/lib/brand";

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

const PERIOD_OPTIONS: Array<{
  months: Period;
  label: string;
  discount?: string;
  recommended?: boolean;
}> = [
  { months: 1, label: "月付" },
  { months: 3, label: "季付", discount: "9 折" },
  { months: 12, label: "年付", discount: "8.5 折", recommended: true },
];

const PLAN_META = {
  PRO: {
    label: "专业版",
    eyebrow: "为持续增长的个人卖家而生",
    headline: "把选品、内容与复盘，交给一支随时在线的 AI 团队",
    summary: "更充足的积分和完整工作流，让每个增长想法更快变成可验证的结果。",
    monthlyCents: 19900,
    benefits: [
      { icon: Coins, value: "5600", label: "积分 / 月" },
      { icon: Video, value: "≈ 20 条", label: "8 秒 AI 出片" },
      { icon: Workflow, value: "全链路", label: "选品到投放复盘" },
      { icon: ShieldCheck, value: "24h", label: "邮件客服响应" },
    ],
    highlights: ["选品榜单与市场数据永久免费", "每次操作前透明展示预计消耗", "积分按你的计费周期自动重置"],
  },
  TEAM: {
    label: "旗舰版",
    eyebrow: "为高频选品与内容生产而生",
    headline: "让高频选品和内容生产稳定不断档",
    summary: "双倍月度积分，超出基线后按实际用量结算，适合多店铺和高频出片。",
    monthlyCents: 39900,
    benefits: [
      { icon: Coins, value: "11200", label: "积分 / 月" },
      { icon: Video, value: "≈ 40 条", label: "8 秒 AI 出片" },
      { icon: Bot, value: "不断供", label: "超额按量计费" },
      { icon: Crown, value: "专属", label: "客户成功经理" },
    ],
    highlights: ["选品榜单与市场数据永久免费", "超基线按 ¥45 / 千积分结算", "每次操作前透明展示预计消耗"],
  },
} as const;

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

  const planMeta = PLAN_META[plan];
  const planLabel = planMeta.label;

  // 价目（与 Go 端 service/billing.go 保持一致）
  const priceCents = useMemo(() => {
    const mult = period === 1 ? 1 : period === 3 ? 2.7 : 10.2;
    return Math.round(planMeta.monthlyCents * mult);
  }, [period, planMeta.monthlyCents]);

  const monthlyEquivalentCents = Math.round(priceCents / period);
  const savedCents = planMeta.monthlyCents * period - priceCents;

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
      setError(e instanceof Error ? e.message : "下单失败，稍后再试");
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
          toast.success("支付成功，方案已升级");
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
    <DialogShell
      onClose={onClose}
      labelledBy="checkout-modal-title"
      closeLabel="关闭升级弹层"
      panelClassName={order ? "max-w-md" : "max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto"}
    >
      {!order ? (
        <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative overflow-hidden bg-[#11131a] px-5 py-6 text-white sm:px-8 sm:py-9 lg:min-h-[650px] lg:px-10 lg:py-10">
            <div
              aria-hidden
              className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-ai-violet/15 blur-3xl"
            />

            <div className="relative">
              <div>
                <BrandLockup
                  tileClassName="h-9 w-9 rounded-xl"
                  markClassName="h-[72%] w-[72%]"
                  wordmarkClassName="text-lg text-white"
                />
                <p className="ml-[46px] -mt-1 text-[10px] tracking-[0.18em] text-zinc-500">
                  {BRAND_SLOGAN}
                </p>
              </div>

              <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-brand-300/20 bg-brand-500/10 px-3 py-1.5 text-[11px] font-semibold text-brand-200 sm:mt-8">
                <Sparkles className="h-3.5 w-3.5" />
                {planMeta.eyebrow}
              </div>
              <h2
                id="checkout-modal-title"
                className="font-display mt-3 max-w-xl text-xl font-semibold leading-tight tracking-[-0.03em] sm:mt-4 sm:text-[30px]"
              >
                {planMeta.headline}
              </h2>
              <p className="mt-2 max-w-lg text-xs leading-5 text-zinc-400 sm:mt-3 sm:text-sm sm:leading-6">
                {planMeta.summary}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-7 sm:gap-2.5">
                {planMeta.benefits.map((benefit) => {
                  const Icon = benefit.icon;
                  return (
                    <div
                      key={benefit.label}
                      className="rounded-xl border border-white/10 bg-white/[0.055] p-2.5 sm:rounded-2xl sm:p-3.5"
                    >
                      <Icon className="hidden h-4 w-4 text-brand-300 sm:block" />
                      <div className="nums text-sm font-bold sm:mt-3 sm:text-lg">{benefit.value}</div>
                      <div className="mt-0.5 text-[10px] leading-4 text-zinc-500 sm:text-[11px]">
                        {benefit.label}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-7 hidden border-t border-white/10 pt-5 sm:block">
                <p className="text-xs font-semibold text-zinc-300">升级后立即解锁</p>
                <ul className="mt-3 space-y-2.5">
                  {planMeta.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs leading-5 text-zinc-400">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
                        strokeWidth={2.5}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="flex flex-col px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-brand-50 px-2 py-1 text-[10px] font-bold tracking-wider text-brand-700">
                  {plan === "TEAM" ? "FLAGSHIP" : plan}
                </span>
                <span className="text-xs font-medium text-zinc-500">升级到{planLabel}</span>
              </div>
              <h3 className="mt-3 text-xl font-bold tracking-tight text-zinc-950">选择订阅周期</h3>
              <p className="mt-1.5 text-xs leading-5 text-zinc-500">
                周期越长越划算，支付成功后权益立即生效。
              </p>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.months}
                  onClick={() => setPeriod(p.months)}
                  aria-pressed={period === p.months}
                  className={`relative rounded-xl border px-2 py-3 text-center transition-all ${
                    period === p.months
                      ? "border-brand-300 bg-brand-50 text-brand-800 ring-2 ring-brand-100"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-[var(--dk-action-regular)]"
                  }`}
                >
                  {p.recommended && (
                    <span className="absolute -right-1.5 -top-2 rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
                      推荐
                    </span>
                  )}
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div
                    className={`mt-1 text-[10px] font-medium ${
                      p.discount ? "text-emerald-600" : "text-zinc-400"
                    }`}
                  >
                    {p.discount ?? "灵活订阅"}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] text-zinc-500">折合每月</p>
                  <div className="mt-0.5 flex items-baseline">
                    <span className="text-sm font-bold text-zinc-900">¥</span>
                    <span className="nums text-3xl font-bold tracking-tight text-zinc-950">
                      {(monthlyEquivalentCents / 100).toFixed(
                        monthlyEquivalentCents % 100 === 0 ? 0 : 2,
                      )}
                    </span>
                    <span className="ml-1 text-xs text-zinc-500">/ 月</span>
                  </div>
                </div>
                {savedCents > 0 && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    已省 ¥{(savedCents / 100).toFixed(savedCents % 100 === 0 ? 0 : 1)}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-zinc-200/70 pt-3 text-xs">
                <span className="text-zinc-500">{period} 个月应付</span>
                <span className="nums font-semibold text-zinc-900">
                  ¥{(priceCents / 100).toFixed(2)} CNY
                </span>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium text-zinc-700">支付方式</div>
              <div className="grid grid-cols-2 gap-2">
                {(["WECHAT", "ALIPAY"] as Provider[]).map((pv) => {
                  const m = PROVIDER_META[pv];
                  const active = provider === pv;
                  return (
                    <button
                      key={pv}
                      onClick={() => setProvider(pv)}
                      aria-pressed={active}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                        active
                          ? "border-brand-300 bg-brand-50/60 text-zinc-950 ring-2 ring-brand-100"
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-[var(--dk-action-regular)]"
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
              <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}

            <div className="mt-auto pt-5">
              <Button
                variant="brand"
                size="lg"
                onClick={createOrder}
                disabled={creating}
                className="w-full"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                立即升级到{planLabel}
                {!creating && <ArrowRight className="h-4 w-4" />}
              </Button>

              <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-zinc-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                安全支付 · 单次订阅 · 不自动续费
              </div>
              <p className="mt-2 text-center text-[10px] leading-4 text-zinc-400">
                支付即视为同意《服务条款》，到期后自动降回免费版。
                <a href="/pricing" className="ml-1 font-medium text-zinc-600 hover:text-brand-600">
                  查看完整权益
                </a>
              </p>
            </div>
          </section>
        </div>
      ) : (
          // 显示二维码 + 轮询
          <div className="p-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-2xs font-medium uppercase tracking-wider text-brand-600">
                  {PROVIDER_META[order.provider].cn} · {order.periodMonths} 个月
                </div>
                <h2 id="checkout-modal-title" className="mt-1 text-xl font-bold tracking-tight">
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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setOrder(null)}
                >
                  重新下单
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-center rounded-2xl border border-zinc-100 bg-white p-5">
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
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
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
    </DialogShell>
  );
}
