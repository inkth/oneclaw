"use client";

type Plan = "PRO" | "TEAM";

// Phase 1:计费流程迁移中,CTA 先统一引导到登录/工作台。
export function PricingCTA({
  plan,
  label,
  className,
}: {
  plan: Plan | "FREE";
  label: string;
  className: string;
}) {
  const href = plan === "FREE" ? "/login" : "/app";
  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}
