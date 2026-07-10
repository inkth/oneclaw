import Link from "next/link";
import { cn } from "@/lib/utils";

// 照搬 Designkit：纯白 + 8px 圆角 + 发丝边 + 极弱阴影
const base = "dk-card";

export function Card({
  className,
  padded = true,
  children,
}: {
  className?: string;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return <div className={cn(base, padded && "p-5", className)}>{children}</div>;
}

/** 可点击卡片：Designkit 的 ShortCutCard hover 是整卡放大 1.03，不抬升、不换描边色。 */
export function CardLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(base, "group block p-5 dk-lift", className)}
    >
      {children}
    </Link>
  );
}
