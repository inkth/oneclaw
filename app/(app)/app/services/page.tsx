"use client";

import { useState } from "react";
import {
  Truck,
  Warehouse,
  PackageCheck,
  Headphones,
  ClipboardList,
  Users,
  Radio,
  Wallet,
  ReceiptText,
  Building2,
  ShieldCheck,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Pill } from "@/components/ui/Pill";
import type { Tone } from "@/lib/ui/tokens";

// 服务板块 = 跨境经营全链路要用到的「外部能力」目录。按经营环节分类，
// 每个条目标注上线状态 + 适用市场，逐步开放对接。这里只做目录与状态展示，具体对接后续接入。
type Status = "live" | "beta" | "soon";

const STATUS_META: Record<Status, { label: string; tone: Tone }> = {
  live: { label: "可预约", tone: "success" },
  beta: { label: "内测中", tone: "warning" },
  soon: { label: "即将上线", tone: "neutral" },
};

// TikTok Shop 主要目标市场。"global" = 与市场无关（如客服、ERP），任何地区筛选下都展示。
type Region = "us" | "uk" | "sea" | "mx" | "eu" | "me" | "global";

const REGION_LABEL: Record<Region, string> = {
  us: "美国",
  uk: "英国",
  sea: "东南亚",
  mx: "墨西哥",
  eu: "欧洲",
  me: "中东",
  global: "全球通用",
};

// 地区筛选项（不含 global——它是「市场无关」标记，会在任意市场下命中）。
const REGION_FILTERS: Region[] = ["us", "uk", "sea", "mx", "eu", "me"];

type Service = {
  label: string;
  desc: string;
  icon: LucideIcon;
  status: Status;
  tags: string[]; // 卖点标签
  regions: Region[]; // 适用市场
};

type Category = {
  key: string;
  label: string;
  desc: string;
  services: Service[];
};

const CATEGORIES: Category[] = [
  {
    key: "fulfillment",
    label: "物流履约",
    desc: "把货又快又省地送到买家手里。",
    services: [
      {
        label: "智能物流",
        desc: "对接头程与海外仓，一键比价下单、同步轨迹。",
        icon: Truck,
        status: "beta",
        tags: ["多渠道比价", "轨迹同步"],
        regions: ["us", "uk", "sea", "mx", "eu", "me"],
      },
      {
        label: "海外仓",
        desc: "一件代发、退货换标、本地尾程，旺季不爆仓。",
        icon: Warehouse,
        status: "soon",
        tags: ["一件代发", "退换处理"],
        regions: ["us", "uk", "sea", "eu", "mx"],
      },
      {
        label: "清关报关",
        desc: "进出口报关与合规申报，避免卡关与扣货。",
        icon: PackageCheck,
        status: "soon",
        tags: ["进出口", "合规申报"],
        regions: ["us", "uk", "sea", "eu", "mx", "me"],
      },
    ],
  },
  {
    key: "operations",
    label: "运营提效",
    desc: "把重复琐碎的日常交给工具。",
    services: [
      {
        label: "在线客服",
        desc: "聚合 TikTok Shop 站内信与多店铺消息，自动回复。",
        icon: Headphones,
        status: "beta",
        tags: ["消息聚合", "自动回复"],
        regions: ["global"],
      },
      {
        label: "ERP 订单管理",
        desc: "多店铺订单、库存、采购一处同步，告别表格。",
        icon: ClipboardList,
        status: "soon",
        tags: ["订单同步", "库存管理"],
        regions: ["global"],
      },
      {
        label: "店铺代运营",
        desc: "专业团队托管选品、上架与日常运营，按效果付费。",
        icon: Building2,
        status: "live",
        tags: ["全托管", "按效果付费"],
        regions: ["us", "uk", "sea"],
      },
    ],
  },
  {
    key: "marketing",
    label: "营销推广",
    desc: "让更多对的人看到你的商品。",
    services: [
      {
        label: "达人对接",
        desc: "寄样、建联、佣金管理，找到适合你商品的带货达人。",
        icon: Users,
        status: "beta",
        tags: ["建联寄样", "佣金管理"],
        regions: ["us", "uk", "sea", "mx"],
      },
      {
        label: "直播代播",
        desc: "专业主播团队代播，覆盖多时段排期与脚本。",
        icon: Radio,
        status: "soon",
        tags: ["多时段排期", "脚本支持"],
        regions: ["sea", "us", "uk"],
      },
      {
        label: "广告代投",
        desc: "GMV Max 广告搭建、托管优化与预算控制。",
        icon: Megaphone,
        status: "soon",
        tags: ["GMV Max", "托管优化"],
        regions: ["global"],
      },
    ],
  },
  {
    key: "finance",
    label: "资金财税",
    desc: "钱安全地收回来，合规地报出去。",
    services: [
      {
        label: "跨境收款",
        desc: "多币种结汇、低费率提现，资金到账更快更稳。",
        icon: Wallet,
        status: "live",
        tags: ["多币种", "低费率"],
        regions: ["global"],
      },
      {
        label: "税务合规",
        desc: "VAT / 销售税注册与申报，远离平台合规风险。",
        icon: ReceiptText,
        status: "soon",
        tags: ["VAT 注册", "代理申报"],
        regions: ["us", "uk", "eu"],
      },
      {
        label: "公司与资质",
        desc: "海外主体注册、店铺入驻资质，一站式办妥。",
        icon: ShieldCheck,
        status: "soon",
        tags: ["主体注册", "入驻资质"],
        regions: ["us", "uk", "sea", "eu"],
      },
    ],
  },
];

const CATEGORY_FILTERS = [{ key: "all", label: "全部" }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))];

// 服务是否命中某个地区筛选：global（市场无关）始终命中；否则看 regions 是否包含该地区。
function matchRegion(svc: Service, region: string) {
  if (region === "all") return true;
  return svc.regions.includes("global") || svc.regions.includes(region as Region);
}

// 适用市场展示文案：含 global 显示「全球通用」，否则列出市场名。
function regionText(svc: Service) {
  if (svc.regions.includes("global")) return "全球通用";
  return svc.regions.map((r) => REGION_LABEL[r]).join(" · ");
}

export default function ServicesPage() {
  const [cat, setCat] = useState("all");
  const [region, setRegion] = useState("all");

  const shown = CATEGORIES
    .filter((c) => cat === "all" || c.key === cat)
    .map((c) => ({ ...c, services: c.services.filter((s) => matchRegion(s, region)) }))
    .filter((c) => c.services.length > 0);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="服务"
        description="把跨境经营全链路要用到的外部能力聚合到一处:物流、客服、达人、收款、财税…… 按经营环节与目标市场分门别类，逐步开放对接。"
      />

      <div className="space-y-2.5">
        <FilterRow label="环节" items={CATEGORY_FILTERS} active={cat} onSelect={setCat} />
        <FilterRow
          label="市场"
          items={[{ key: "all", label: "全部" }, ...REGION_FILTERS.map((r) => ({ key: r, label: REGION_LABEL[r] }))]}
          active={region}
          onSelect={setRegion}
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-5 py-8 text-center text-sm text-zinc-400">
          该市场暂无匹配的服务，换个筛选试试。
        </p>
      ) : (
        <div className="space-y-8">
          {shown.map((c) => (
            <section key={c.key} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">{c.label}</h2>
                <p className="mt-0.5 text-xs text-zinc-400">{c.desc}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {c.services.map((svc) => (
                  <ServiceCard key={svc.label} service={svc} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  items,
  active,
  onSelect,
}: {
  label: string;
  items: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-2xs text-zinc-400">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Pill key={it.key} active={active === it.key} onClick={() => onSelect(it.key)}>
            {it.label}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: Service }) {
  const { label, desc, icon: Icon, status, tags } = service;
  const meta = STATUS_META[status];
  const live = status === "live";

  return (
    <div
      className={
        "flex h-full flex-col rounded-xl border p-5 transition-colors " +
        (live
          ? "border-zinc-200/80 bg-white hover:border-brand-200 hover:bg-brand-50/30"
          : "border-zinc-100 bg-zinc-50/60")
      }
    >
      <div className="flex items-center gap-2.5">
        <div
          className={
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
            (live ? "bg-brand-50 text-brand-500" : "bg-zinc-100 text-zinc-400")
          }
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <span className="font-medium text-zinc-900">{label}</span>
        <Badge tone={meta.tone} className="ml-auto" outline={false}>
          {meta.label}
        </Badge>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-zinc-500">{desc}</p>

      <p className="mt-2 text-2xs text-zinc-400">适用 · {regionText(service)}</p>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {tags.map((t) => (
          <span key={t} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-2xs text-zinc-500">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
