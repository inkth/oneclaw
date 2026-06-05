import Link from "next/link";
import { Truck, Headphones, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

type Service = {
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string; // 有 href = 已上线
};

const services: Service[] = [
  {
    label: "智能物流",
    desc: "对接头程与海外仓，一键比价下单、同步轨迹。",
    icon: Truck,
  },
  {
    label: "在线客服",
    desc: "聚合 TikTok Shop 站内信与多店铺消息，自动回复。",
    icon: Headphones,
  },
  {
    label: "达人对接",
    desc: "寄样、建联、佣金管理，找到适合你商品的带货达人。",
    icon: Users,
  },
];

export default function ServicesPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="服务" description="把经营全链路要用到的外部能力聚合到一处，开箱即用。" />

      <div className="grid gap-3 sm:grid-cols-2">
        {services.map(({ label, desc, icon: Icon, href }) => {
          const card = (
            <div
              className={
                "h-full rounded-xl border p-5 transition-colors " +
                (href
                  ? "border-zinc-200/80 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                  : "border-zinc-100 bg-zinc-50/60")
              }
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-lg " +
                    (href ? "bg-indigo-50 text-indigo-500" : "bg-zinc-100 text-zinc-400")
                  }
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <span className="font-medium">{label}</span>
                {!href && (
                  <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-2xs text-zinc-400">
                    即将上线
                  </span>
                )}
              </div>
              <p className="mt-2.5 text-sm text-zinc-500">{desc}</p>
            </div>
          );
          return href ? (
            <Link key={label} href={href}>
              {card}
            </Link>
          ) : (
            <div key={label}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
