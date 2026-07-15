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
    <div className={cn("flex flex-col gap-4 pb-0.5 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-title text-ink">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--dk-content-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </div>
  );
}
