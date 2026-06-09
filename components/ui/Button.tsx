import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "brand" | "vibrant" | "secondary" | "ghost" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // 中性强操作：实心黑（数据密集处需克制时用）
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm press",
  // 页面级主操作：实心电紫 + 紫色辉光（导入选品 / 发送 / 登录 / 订阅）
  brand: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow-[var(--shadow-brand)] press",
  // 成交/兴奋操作：violet→fuchsia 活力渐变 + 活力辉光（营销 CTA / 定价高亮 / 派活）。白名单使用。
  vibrant: "bg-vibrant text-white shadow-sm hover:shadow-[var(--shadow-vibrant)] pop",
  // 次级：白底 + 描边
  secondary: "bg-white text-zinc-800 ring-1 ring-zinc-200 hover:ring-zinc-300 hover:bg-zinc-50 press",
  // 幽灵：仅 hover 浅底
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  // 弱强调：accent 浅底
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100 press",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-2xl",
};

const base =
  "inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, SIZES[size], VARIANTS[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  children,
  href,
  ...props
}: CommonProps & { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Link href={href} className={cn(base, SIZES[size], VARIANTS[variant], className)} {...props}>
      {children}
    </Link>
  );
}
