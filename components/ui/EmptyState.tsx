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
        "rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="text-base font-semibold text-zinc-900">{title}</div>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
