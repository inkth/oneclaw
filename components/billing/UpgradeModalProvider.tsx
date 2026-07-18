"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckoutModal } from "@/components/CheckoutModal";

type Plan = "PRO" | "TEAM";

const UpgradeModalCtx = createContext<{
  open: (plan?: Plan) => void;
} | null>(null);

/** 跳设置页的兜底：Provider 外、或拿不到 workspaceId 时仍能走原来的深链。 */
function fallbackToSettings(plan: Plan) {
  window.location.href = `/app/settings?upgrade=${plan}`;
}

/**
 * 全局单实例升级弹窗。挂在 (app) layout，触发点用 useUpgradeModal().open("PRO")。
 * 顶栏/菜单点「升级会员」原地弹浮层，不再跳设置页（设置页的 ?upgrade= 深链仍保留，
 * 供 /pricing 等外部入口使用）。
 */
export function UpgradeModalProvider({
  workspaceId,
  children,
}: {
  workspaceId: string | null;
  children: React.ReactNode;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);

  const open = useCallback(
    (p: Plan = "PRO") => {
      // 没有 workspace（游客/取数失败）时开不了单，退回设置页
      if (!workspaceId) return fallbackToSettings(p);
      setPlan(p);
    },
    [workspaceId],
  );

  return (
    <UpgradeModalCtx.Provider value={{ open }}>
      {children}
      {plan && workspaceId && (
        <CheckoutModal plan={plan} workspaceId={workspaceId} onClose={() => setPlan(null)} />
      )}
    </UpgradeModalCtx.Provider>
  );
}

export function useUpgradeModal() {
  const ctx = useContext(UpgradeModalCtx);
  if (ctx) return ctx;
  return { open: (p: Plan = "PRO") => fallbackToSettings(p) };
}
