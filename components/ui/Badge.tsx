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
        // Designkit 圆角只有 8/12/16/20 几档，胶囊形只留给 Tab/Pill 本身，
        // 状态标签统一收到 8px（rounded-lg），不再用 rounded-full。
        "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-2xs font-[550]",
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
