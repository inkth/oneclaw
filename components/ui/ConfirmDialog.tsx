"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DialogShell } from "./Dialog";
import { Button } from "./Button";
import { CreditCost } from "./CreditCost";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger 用于删除等不可逆动作：红色主按钮，默认焦点落在「取消」。 */
  tone?: "default" | "danger";
  /** 传了就在按钮旁标出本次预计消耗，替代过去写在文案里的「约 N 积分」。 */
  credits?: number;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

// Provider 外（营销页等）兜底回原生 confirm，组件不至于崩。
const fallbackConfirm: ConfirmFn = async ({ title, description }) =>
  window.confirm(typeof description === "string" ? `${title}\n${description}` : title);

/** 全局单实例确认弹窗。挂在 (app) layout，触发点用 await useConfirm()({...})。 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // 上一个还悬着就先否掉，否则它的 promise 永远不 settle，调用方会卡住。
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {options && <ConfirmDialog options={options} onSettle={settle} />}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx) ?? fallbackConfirm;
}

function ConfirmDialog({
  options,
  onSettle,
}: {
  options: ConfirmOptions;
  onSettle: (value: boolean) => void;
}) {
  const { title, description, confirmLabel = "确定", cancelLabel = "取消", tone = "default", credits } = options;
  const danger = tone === "danger";

  return (
    <DialogShell
      onClose={() => onSettle(false)}
      labelledBy="confirm-dialog-title"
      describedBy={description ? "confirm-dialog-desc" : undefined}
      panelClassName="max-w-sm"
      showClose={false}
    >
      <div className="p-6">
        <div className="flex gap-3">
          {danger && (
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-subtitle">
              {title}
            </h2>
            {description && (
              <p id="confirm-dialog-desc" className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {credits !== undefined && <CreditCost credits={credits} className="mr-auto" />}
          {/* 不可逆动作把初始焦点放在「取消」，避免一个回车就删掉东西。 */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onSettle(false)}
            {...(danger ? { "data-dialog-initial-focus": "" } : {})}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={() => onSettle(true)}
            {...(danger ? {} : { "data-dialog-initial-focus": "" })}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
