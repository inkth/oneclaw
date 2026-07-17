import { FileQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[58vh] items-center justify-center py-12">
      <section className="dk-card w-full max-w-xl px-6 py-10 text-center sm:px-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--dk-surface-2)] text-[var(--dk-content-secondary)] ring-1 ring-black/[0.04]">
          <FileQuestion className="h-5 w-5" />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--dk-content-tertiary)]">
          404
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[var(--dk-content-primary)]">
          没有找到这个页面
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--dk-content-secondary)]">
          它可能已被移动、删除，或链接地址有误。你可以回到工作台继续。
        </p>
        <div className="mt-6">
          <ButtonLink href="/app" variant="primary">
            返回工作台
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
