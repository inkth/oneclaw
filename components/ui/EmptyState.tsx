import { cn } from "@/lib/utils";

/** 全站通用空态 / 即将上线占位。极简虚线卡片。 */
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
        // 照搬 Designkit：无卡框、居中、线框图标 + 粗标题 + 灰副标题 + 近黑 CTA
        "px-6 py-16 text-center",
        className
      )}
    >
      {Icon && (
        // 线框图标最淡，收到三档文字色里最浅的 tertiary
        <Icon className="mx-auto mb-4 h-12 w-12 text-[var(--dk-content-tertiary)]" strokeWidth={1.5} />
      )}
      <div className="text-subtitle">{title}</div>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--dk-content-secondary)]">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
