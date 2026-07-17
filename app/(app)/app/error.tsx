"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[58vh] items-center justify-center py-12">
      <section className="dk-card w-full max-w-xl px-6 py-10 text-center sm:px-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-[var(--dk-content-primary)]">
          页面暂时没有准备好
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--dk-content-secondary)]">
          可能是网络波动或服务短暂繁忙。你的数据不会因此丢失，可以立即重试。
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-[var(--dk-content-tertiary)]">
            参考编号 {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={unstable_retry}>
            <RotateCcw className="h-4 w-4" />
            重新加载
          </Button>
          <ButtonLink href="/app" variant="secondary">
            返回工作台
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
