import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { BRAND_SLOGAN } from "@/lib/brand";

export const metadata = { title: "登录 · 发现猫" };

export default function LoginPage() {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[var(--shadow-card)] backdrop-blur-xl sm:p-9">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-2xs font-bold text-brand-700">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        {BRAND_SLOGAN}
      </div>
      <h1 className="text-3xl font-black tracking-[-0.04em] text-ink">登录发现猫</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
        使用中国大陆手机号验证码登录；首次登录会自动创建账号和工作台。
      </p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-zinc-50" />}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-7 text-center text-2xs text-zinc-400">
        登录即表示同意 <a href="/legal/terms" className="underline decoration-zinc-300 underline-offset-4 hover:text-zinc-700">服务条款</a> 与{" "}
        <a href="/legal/privacy" className="underline decoration-zinc-300 underline-offset-4 hover:text-zinc-700">隐私政策</a>。
      </p>
    </div>
  );
}
