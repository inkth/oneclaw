"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";

const PHONE_RE = /^1[3-9]\d{9}$/;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/app";

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
      setError(e instanceof Error ? e.message : "发送失败");
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
      await apiBrowser("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      router.push(callbackUrl);
      router.refresh();
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
            <label className="block text-xs font-medium text-zinc-700">手机号</label>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-zinc-200/80 px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand-200 focus-within:border-brand-300">
              <span className="text-sm text-zinc-500">+86</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={11}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                placeholder="138 0000 0000"
                className="flex-1 text-sm outline-none placeholder-zinc-300 bg-transparent"
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 hover:shadow-[var(--shadow-brand)] disabled:opacity-60 transition-all"
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
            <label className="block text-xs font-medium text-zinc-700">6 位验证码</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && verifyAndSignIn()}
              placeholder="000000"
              className="mt-1.5 w-full rounded-lg border border-zinc-200/80 px-3 py-2.5 text-center font-mono text-lg tracking-[0.5em] outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 hover:shadow-[var(--shadow-brand)] disabled:opacity-60 transition-all"
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
