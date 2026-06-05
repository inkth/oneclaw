"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  /** 进场样式：上浮 / 缩放 / 纯淡入 */
  variant?: "rise" | "scale" | "fade";
  /** 错峰序号 → 延迟 = index * step */
  index?: number;
  /** 每序号步进毫秒（默认 60） */
  step?: number;
  /** 显式延迟毫秒（覆盖 index*step） */
  delay?: number;
  as?: ElementType;
  className?: string;
};

/**
 * 轻量进场：IntersectionObserver 首次进入视口加 `in-view` 触发 CSS 过渡，
 * 触发后取消观察。prefers-reduced-motion 由 globals.css 强制 opacity:1（立即显示）。
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
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 减少动态偏好由 globals.css 的 prefers-reduced-motion 规则强制 opacity:1，
    // 这里无需特判，observer 照常运行即可。
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e?.isIntersecting) {
          setInView(true);
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const d = delay ?? index * step;
  return (
    <Tag
      ref={ref}
      style={{ "--reveal-delay": `${d}ms` } as CSSProperties}
      className={cn("reveal", `reveal-${variant}`, inView && "in-view", className)}
    >
      {children}
    </Tag>
  );
}
