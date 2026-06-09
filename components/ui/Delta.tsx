import { cn } from "@/lib/utils";
import { DELTA_TONES, deltaDir } from "@/lib/ui/tokens";

/** 涨跌幅：value 为百分数（如 12.3 表示 +12.3%）。全站统一涨跌色，不再内联 emerald/rose。 */
export function Delta({
  value,
  className,
  title,
}: {
  value: number | null | undefined;
  className?: string;
  title?: string;
}) {
  const dir = deltaDir(value);
  if (dir === "flat") return null;
  return (
    <span
      title={title ?? "近 7 天变化"}
      className={cn("text-2xs font-medium tabular-nums", DELTA_TONES[dir], className)}
    >
      {dir === "up" ? "↑" : "↓"}
      {Math.abs(value as number).toFixed(1)}%
    </span>
  );
}
