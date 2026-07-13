import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { BRAND_SLOGAN } from "@/lib/brand";

export const metadata = { title: "登录 · 发现猫" };

export default function LoginPage() {
  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm">
      <div className="mb-4 inline-flex rounded-full bg-brand-50 px-3 py-1 text-2xs font-semibold text-brand-700">{BRAND_SLOGAN}</div>
      <h1 className="text-2xl font-semibold tracking-tight">登录发现猫</h1>
      <p className="mt-1.5 text-sm text-zinc-500">
        使用中国大陆手机号验证码登录；首次登录会自动创建账号和工作台。
      </p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-44 rounded-lg bg-zinc-50 animate-pulse" />}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-2xs text-zinc-400">
        登录即表示同意 <a href="/legal/terms" className="underline">服务条款</a> 与{" "}
        <a href="/legal/privacy" className="underline">隐私政策</a>。
      </p>
    </div>
  );
}
