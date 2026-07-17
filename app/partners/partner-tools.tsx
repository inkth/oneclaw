"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Calculator, Loader2 } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";

const PRO_PRICE = 199;
const TEAM_PRICE = 399;
const COMMISSION_RATE = 0.2;

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

export function CommissionCalculator() {
  const [customers, setCustomers] = useState(20);
  const [teamRatio, setTeamRatio] = useState(25);

  const result = useMemo(() => {
    const averagePrice = PRO_PRICE * (1 - teamRatio / 100) + TEAM_PRICE * (teamRatio / 100);
    return Math.round(customers * averagePrice * COMMISSION_RATE);
  }, [customers, teamRatio]);

  return (
    <div className="rounded-[28px] border border-white/10 bg-brand-950 p-6 text-white shadow-[0_28px_80px_-36px_rgba(18,24,60,.85)] sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-200">
          <Calculator className="h-5 w-5" />
        </span>
        <div>
          <div className="font-display font-semibold">分成试算</div>
          <div className="mt-0.5 text-xs text-white/50">拉动参数，看看你的潜在收益</div>
        </div>
      </div>

      <div className="mt-8 space-y-7">
        <label className="block">
          <span className="flex items-center justify-between text-sm">
            <span className="text-white/65">每月成功邀请客户</span>
            <strong className="nums text-white">{customers} 位</strong>
          </span>
          <input
            className="mt-3 w-full accent-brand-400"
            type="range"
            min="1"
            max="100"
            value={customers}
            onChange={(event) => setCustomers(Number(event.target.value))}
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between text-sm">
            <span className="text-white/65">Team 客户占比</span>
            <strong className="nums text-white">{teamRatio}%</strong>
          </span>
          <input
            className="mt-3 w-full accent-brand-400"
            type="range"
            min="0"
            max="100"
            step="5"
            value={teamRatio}
            onChange={(event) => setTeamRatio(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="mt-8 rounded-[20px] border border-white/10 bg-white/[0.07] p-5">
        <div className="text-xs font-medium text-white/50">预估每月订阅分成</div>
        <div className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em] nums">
          <span className="mr-1 text-xl text-brand-200">¥</span>{money(result)}
        </div>
        <p className="mt-3 text-xs leading-5 text-white/45">
          以 Pro ¥199/月、Team ¥399/月起和 20% 分成估算，实际以客户有效付费与结算数据为准。
        </p>
      </div>
    </div>
  );
}

type FormState = {
  name: string;
  phone: string;
};

const initialForm: FormState = { name: "", phone: "" };

export function PartnerApplicationForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiBrowser("/partner-applications", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
        }),
      });
      setDone(true);
      setForm(initialForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[28px] border border-emerald-200 bg-emerald-50/70 px-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <h3 className="mt-5 font-display text-2xl font-semibold text-zinc-950">注册信息已收到</h3>
        <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-600">
          我们会尽快审核注册信息，并通过该手机号与你联系。
        </p>
        <button type="button" onClick={() => setDone(false)} className="mt-6 text-sm font-semibold text-brand-700 hover:text-brand-800">
          再提交一份申请
        </button>
      </div>
    );
  }

  const fieldClass = "mt-2 h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-950 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

  return (
    <form onSubmit={submit} className="rounded-[28px] border border-black/[0.07] bg-white p-6 shadow-[0_24px_70px_-48px_rgba(18,20,25,.45)] sm:p-8">
      <div className="grid gap-5">
        <label className="text-sm font-medium text-zinc-700">
          代理商名称 <span className="text-rose-500">*</span>
          <input required maxLength={100} autoComplete="organization" value={form.name} onChange={(event) => update("name", event.target.value)} className={fieldClass} placeholder="请填写代理商名称" />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          手机号 <span className="text-rose-500">*</span>
          <input required type="tel" inputMode="numeric" autoComplete="tel" pattern="[0-9]{11}" maxLength={11} value={form.phone} onChange={(event) => update("phone", event.target.value.replace(/\D/g, "").slice(0, 11))} className={fieldClass} placeholder="11 位手机号" />
        </label>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-sm font-bold text-white shadow-[var(--shadow-brand)] transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        {submitting ? "正在提交" : "注册成为代理商"}
      </button>
      <p className="mt-4 text-center text-xs leading-5 text-zinc-400">注册信息审核通过后，我们会为该手机号开通代理身份。</p>
    </form>
  );
}
