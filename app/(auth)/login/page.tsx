import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "登录 · OneClaw" };

export default function LoginPage() {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">登录 / 注册 OneClaw</h1>
      <p className="mt-1.5 text-sm text-zinc-500">
        中国大陆手机号，验证码登录，新用户自动开通工作台。
      </p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-44 rounded-xl bg-zinc-50 animate-pulse" />}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-2xs text-zinc-400">
        登录即表示同意 <a href="#" className="underline">服务条款</a> 与{" "}
        <a href="#" className="underline">隐私政策</a>。
      </p>
    </div>
  );
}
