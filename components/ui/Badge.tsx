import { cn } from "@/lib/utils";
import { STATUS_TONES, type Tone } from "@/lib/ui/tokens";

/** 小标签：语义 tone，全站统一。outline=false 时去掉描边（更轻）。 */
export function Badge({
  tone = "neutral",
  icon,
  title,
  outline = true,
  className,
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  title?: string;
  outline?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium",
        outline ? "border" : "border border-transparent",
        STATUS_TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
