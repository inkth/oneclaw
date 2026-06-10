import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "brand" | "vibrant" | "secondary" | "ghost" | "subtle";
type Size = "sm" | "md" | "lg";

// 照搬 Designkit：主操作统一近黑胶囊（#1C1D1F），不再用饱和电紫/渐变。
// brand / vibrant 保留变体名（避免改调用点），观感全部收敛到近黑。
const VARIANTS: Record<Variant, string> = {
  // 中性强操作 == Designkit Send 按钮：近黑胶囊
  primary: "bg-[#1c1d1f] text-white hover:bg-black shadow-sm press",
  // 页面级主操作：同近黑（原电紫）
  brand: "bg-[#1c1d1f] text-white hover:bg-black shadow-sm press",
  // 成交/兴奋操作：同近黑（原 violet→fuchsia 渐变）
  vibrant: "bg-[#1c1d1f] text-white hover:bg-black shadow-sm press",
  // 次级：白底 + 发丝描边
  secondary: "bg-white text-ink ring-1 ring-black/10 hover:ring-black/20 hover:bg-zinc-50 press",
  // 幽灵：仅 hover 浅底
  ghost: "text-zinc-600 hover:bg-black/5 hover:text-ink",
  // 弱强调：中性浅底
  subtle: "bg-black/[0.04] text-ink hover:bg-black/[0.07] press",
};

// 照搬 Designkit：按钮全部胶囊圆角（rounded-full）。
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5 rounded-full",
  md: "h-10 px-4 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-base gap-2 rounded-full",
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
