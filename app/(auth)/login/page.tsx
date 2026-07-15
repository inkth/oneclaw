import { Suspense } from "react";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "./login-form";
import { BRAND_SLOGAN } from "@/lib/brand";

export const metadata = { title: "登录 · 发现猫" };

export default function LoginPage() {
  return (
    <div className="public-surface overflow-hidden rounded-[28px] sm:rounded-[32px] lg:grid lg:min-h-[560px] lg:grid-cols-[1.02fr_.98fr]">
      <aside className="relative hidden overflow-hidden bg-brand-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-ai-violet/30 blur-[100px]" />
        <div aria-hidden className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-brand-500/30 blur-[100px]" />
        <div aria-hidden className="claw-stamp absolute right-10 top-9 text-white/10" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.18em] text-brand-300">
            <Sparkles className="h-3.5 w-3.5" />
            {BRAND_SLOGAN}
          </div>
          <h2 className="mt-6 max-w-md font-display text-[2.65rem] font-semibold leading-[1.08] tracking-[-0.035em]">
            回到你的 AI 出海团队
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">
            从选品判断到内容生产，所有对话、任务和交付物都会在同一个工作台继续。
          </p>
        </div>

        <div className="relative space-y-3 border-t border-white/10 pt-6">
          {["验证码登录，无需记密码", "首次登录自动创建工作台", "任务与结果持续保存"].map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm text-white/75">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-brand-200">
                <Check className="h-3.5 w-3.5" />
              </span>
              {item}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-brand-200/70 bg-brand-50 px-3 py-1.5 text-2xs font-bold text-brand-700 lg:hidden">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          {BRAND_SLOGAN}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xs font-bold uppercase tracking-[0.16em] text-brand-600">Welcome back</div>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.035em] text-ink">登录发现猫</h1>
          </div>
          <span className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 sm:flex">
            <ShieldCheck className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          使用中国大陆手机号验证码登录；首次登录会自动创建账号和工作台。
        </p>
        <div className="mt-8">
          <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-zinc-50" />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-7 text-center text-2xs leading-5 text-zinc-400">
          登录即表示同意 <a href="/legal/terms" className="rounded-sm underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-700">服务条款</a> 与{" "}
          <a href="/legal/privacy" className="rounded-sm underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-700">隐私政策</a>。
        </p>
      </div>
    </div>
  );
}
