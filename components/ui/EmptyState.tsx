import { cn } from "@/lib/utils";

/** 全站通用空态 / 即将上线占位。极简虚线卡片。 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl ring-edge surface-sheen px-6 py-14 text-center",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-6 h-40 w-64 -translate-x-1/2 aura-violet opacity-60"
      />
      <div className="relative">
        {Icon && (
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-[var(--shadow-brand)]">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="text-base font-semibold text-zinc-900">{title}</div>
        {description && (
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">{description}</p>
        )}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
