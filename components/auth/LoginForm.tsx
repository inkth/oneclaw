"use client";

import { useEffect, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";

const PHONE_RE = /^1[3-9]\d{9}$/;

/** 手机号 + 验证码两步登录表单。成功后只调 onSuccess，导航/刷新交给调用方（/login 页跳 callbackUrl，弹窗原地 refresh）。
 *  inviteCode：代理商邀请码。/login 页由 ?invite= 传入；弹窗登录无 prop，回退读 localStorage("oc_invite")
 *  （落地页 /r/[code] 已写入），两条登录路径都能带上归因码。仅首次注册时后端用于绑定。 */
export function LoginForm({ onSuccess, inviteCode }: { onSuccess: () => void; inviteCode?: string }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  async function sendCode() {
    if (!PHONE_RE.test(phone)) {
      setError("请输入合法的中国大陆 11 位手机号");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const data = await apiBrowser<{ devCode?: string }>("/auth/send-code", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setStep("code");
      setSecondsLeft(60);
      if (data.devCode) {
        toast.message("dev 模式验证码", {
          description: `${data.devCode}（也已打印到服务端日志）`,
          duration: 8000,
        });
      } else {
        toast.success("验证码已发送");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败，稍后再试");
    } finally {
      setSending(false);
    }
  }

  async function verifyAndSignIn() {
    if (!/^\d{6}$/.test(code)) {
      setError("请输入 6 位验证码");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const invite =
        inviteCode ??
        (typeof window !== "undefined" ? localStorage.getItem("oc_invite") ?? undefined : undefined);
      await apiBrowser("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, code, inviteCode: invite }),
      });
      if (typeof window !== "undefined") localStorage.removeItem("oc_invite");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败，请稍后再试");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      {step === "phone" ? (
        <>
          <div>
            <label className="block text-xs font-semibold text-zinc-700">手机号</label>
            <div className="mt-2.5 flex h-13 items-center gap-3 rounded-2xl border border-zinc-200/90 bg-zinc-50/65 px-4 transition-[background-color,border-color,box-shadow] focus-within:border-brand-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-100/70">
              <span className="border-r border-zinc-200 pr-3 text-sm font-medium text-zinc-500">+86</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={11}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                placeholder="138 0000 0000"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-300"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
              {error}
            </div>
          )}

          <button
            onClick={sendCode}
            disabled={sending || !phone}
            className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-bold text-white shadow-[0_14px_28px_-16px_rgba(48,70,184,.75)] transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            发送验证码
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
            >
              <ArrowLeft className="h-3 w-3" />
              换号码
            </button>
            <div className="text-xs text-zinc-500">
              已发送到 <span className="font-mono">+86 {phone}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700">6 位验证码</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && verifyAndSignIn()}
              placeholder="000000"
              className="mt-2.5 h-13 w-full rounded-2xl border border-zinc-200/90 bg-zinc-50/65 px-3 text-center font-mono text-lg tracking-[0.5em] outline-none transition-[background-color,border-color,box-shadow] focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100/70"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
              {error}
            </div>
          )}

          <button
            onClick={verifyAndSignIn}
            disabled={verifying || code.length !== 6}
            className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-bold text-white shadow-[0_14px_28px_-16px_rgba(48,70,184,.75)] transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
            登录
          </button>

          <div className="text-center">
            {secondsLeft > 0 ? (
              <span className="text-xs text-zinc-400">
                {secondsLeft}s 后可重新发送
              </span>
            ) : (
              <button
                onClick={sendCode}
                disabled={sending}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                {sending ? "重发中…" : "重新发送验证码"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
