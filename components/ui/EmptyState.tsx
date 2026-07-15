import { cn } from "@/lib/utils";

/** 全站通用空态 / 即将上线占位：轻表面承托、明确下一步。 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-dashed border-black/[0.09] bg-white/45 px-6 py-12 text-center sm:py-14",
        className
      )}
    >
      {Icon && (
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-black/[0.06] bg-white text-brand-600 shadow-[0_8px_24px_-20px_rgba(18,20,25,.5)]">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      )}
      <div className="text-subtitle">{title}</div>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--dk-content-secondary)]">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
