import { cn } from "@/lib/utils";

/** 由字符串散列出稳定色相，用于给占位面一抹低饱和的稳定底色（仍读作骨架而非字母块）。 */
function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * 媒体占位：精致 shimmer 面，无字无 emoji。
 * - 传 `seed`（如 id/name）→ 稳定柔色调；不传 → 默认品牌紫渐变。
 * - 可选 `icon`（lucide）作极淡媒体类型提示（图标非字符）。
 */
export function MediaPlaceholder({
  seed,
  icon: Icon,
  className,
  rounded = "rounded-xl",
}: {
  seed?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  rounded?: string;
}) {
  const hue = seed ? hashHue(seed) : null;
  // Designkit 去渐变：稳定色相收成单一纯色块（而不是三色渐变），
  // 与卡片/按钮的「不用渐变」是同一条规则，只是这里色相仍按 seed 哈希稳定取值。
  const style = hue == null ? undefined : { background: `hsl(${hue} 40% 93%)` };
  return (
    <div
      aria-hidden
      style={style}
      className={cn("skeleton-media flex items-center justify-center", rounded, className)}
    >
      {Icon && <Icon className="h-7 w-7 text-brand-300/70" />}
    </div>
  );
}
