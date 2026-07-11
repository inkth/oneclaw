"use client";

type Plan = "PRO" | "TEAM";

// FREE 引导登录；付费档跳设置页并带 upgrade 参数，落地后自动弹出收银台。
export function PricingCTA({
  plan,
  label,
  className,
}: {
  plan: Plan | "FREE";
  label: string;
  className: string;
}) {
  const href = plan === "FREE" ? "/login" : `/app/settings?upgrade=${plan}`;
  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}
