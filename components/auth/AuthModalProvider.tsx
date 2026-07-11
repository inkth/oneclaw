"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AuthModal } from "./AuthModal";
import { setAuthExpiredHandler } from "@/lib/auth-expired";

export type AuthModalOptions = {
  title?: string;
  desc?: string;
  onSuccess?: () => void;
};

const AuthModalCtx = createContext<{
  open: (options?: AuthModalOptions) => void;
} | null>(null);

/** 全局单实例登录弹窗。挂在 (app) layout，触发点用 useAuthModal().open({...})。 */
export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  // null = 关闭；open() 不带参数时用 {} 走默认文案
  const [options, setOptions] = useState<AuthModalOptions | null>(null);
  const open = useCallback((o?: AuthModalOptions) => setOptions(o ?? {}), []);

  // 轮询/取数遇到 401 时唤起本弹窗；已打开则忽略，避免空轮反复触发。
  useEffect(() => {
    setAuthExpiredHandler(() =>
      setOptions((cur) =>
        cur ?? { title: "登录已过期", desc: "为继续操作请重新登录，任务进度已保存。" },
      ),
    );
    return () => setAuthExpiredHandler(null);
  }, []);

  return (
    <AuthModalCtx.Provider value={{ open }}>
      {children}
      {options && (
        <AuthModal
          context={options}
          onClose={() => setOptions(null)}
          onSuccess={options.onSuccess}
        />
      )}
    </AuthModalCtx.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalCtx);
  if (ctx) return ctx;
  // Provider 外（如营销页误用）兜底跳登录页，组件不至于崩
  return {
    open: () => {
      window.location.href = `/login?callbackUrl=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
    },
  };
}
