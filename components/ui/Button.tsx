import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "brand" | "vibrant" | "secondary" | "ghost" | "subtle";
type Size = "sm" | "md" | "lg";

// primary = 中性强操作（发送/确认）→ 近黑胶囊；
// brand / vibrant = 品牌级主 CTA → 电紫「点睛」(.pop-cta，恒电紫，不被 app-skin 近黑级联压制)，
// 让关键转化动作（收藏爆品 / 升级会员 等）发声。
// 全部取自 Designkit 的 --background-btn-* token。注意它的主操作是近黑而非品牌色，
// 品牌色只留给「成交」级动作（brand / vibrant）。
const VARIANTS: Record<Variant, string> = {
  // 中性强操作 == Designkit Send 按钮：近黑
  primary:
    "bg-[var(--dk-btn-black)] text-white hover:bg-[var(--dk-btn-black-hover)] press",
  // 页面级主 CTA：电紫点睛
  brand: "pop-cta press",
  // 成交/兴奋操作：电紫点睛
  vibrant: "pop-cta press",
  // 次级：白底 + 发丝描边
  secondary:
    "bg-white text-[var(--dk-content-primary)] border border-[var(--dk-stroke-border)] hover:bg-[var(--dk-btn-tertiary)] press",
  // 幽灵：仅 hover 淡蓝灰底（与导航轨同一个 --dk-action-regular）
  ghost:
    "text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)] hover:text-[var(--dk-content-primary)]",
  // 弱强调：中性浅底
  subtle:
    "bg-[var(--dk-btn-tertiary)] text-[var(--dk-content-primary)] hover:bg-[var(--dk-btn-tertiary-hover)] press",
};

// Designkit 按钮圆角是 8（--radius-8），不是 12，更不是胶囊。lg=44px 主 CTA 高度。
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-lg",
};

// Designkit 的按钮字重是 550（可变字体的半档），比 600 轻、比 500 实。
// 禁用态用浅灰底灰字，而不是把近黑压到 50% 透明——后者读起来仍像「可点」。
const base =
  "inline-flex items-center justify-center font-[550] transition-colors whitespace-nowrap " +
  "disabled:pointer-events-none disabled:border-transparent disabled:bg-[var(--dk-btn-tertiary)] disabled:text-[var(--dk-content-tertiary)] disabled:shadow-none " +
  "shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40";

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
