import { cn } from "@/lib/utils";

export function SectionHeader({
  icon: Icon,
  title,
  meta,
  actions,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex min-w-0 flex-wrap items-center gap-2", className)}>
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--dk-surface-2)] text-[var(--dk-content-secondary)]">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <h2 className="text-sm font-semibold text-[var(--dk-content-primary)]">{title}</h2>
      {meta && <span className="text-xs text-[var(--dk-content-tertiary)]">{meta}</span>}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
