import { type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  variant?: "rise" | "scale" | "fade";
  index?: number;
  step?: number;
  delay?: number;
  as?: ElementType;
  className?: string;
};

/**
 * 内容默认可见；支持 `@starting-style` 的浏览器会附加一次轻量进场。
 * 锚点直达、禁用脚本、慢设备和打印/截图都不会出现空白章节。
 */
export function Reveal({
  children,
  variant = "rise",
  index = 0,
  step = 60,
  delay,
  as,
  className,
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const d = delay ?? index * step;

  return (
    <Tag
      style={{ "--reveal-delay": `${d}ms` } as CSSProperties}
      className={cn("reveal", `reveal-${variant}`, className)}
    >
      {children}
    </Tag>
  );
}
