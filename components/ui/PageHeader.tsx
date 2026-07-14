import { cn } from "@/lib/utils";

/** 统一页头：标题（可带角标）+ 副标题 + 右侧操作区。全站各页头部一致。 */
export function PageHeader({
  title,
  badge,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="relative min-w-0 pl-4 before:absolute before:bottom-0.5 before:left-0 before:top-0.5 before:w-1 before:rounded-full before:bg-brand-500">
        <div className="flex items-center gap-2.5">
          <h1 className="text-title text-ink">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--dk-content-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
