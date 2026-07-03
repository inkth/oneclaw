"use client";

import { useEffect, useState } from "react";
import {
  Truck,
  Warehouse,
  PackageCheck,
  Users,
  Radio,
  Wallet,
  ReceiptText,
  ShieldCheck,
  Megaphone,
  Headset,
  QrCode,
  Copy,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Tone } from "@/lib/ui/tokens";

// 服务板块 = 跨境经营全链路要用到的「外部能力」目录。按经营环节分类，
// 每个条目标注上线状态 + 适用市场，逐步开放对接。这里只做目录与状态展示，具体对接走「预约咨询」。
type Status = "live" | "beta" | "soon";

const STATUS_META: Record<Status, { label: string; tone: Tone }> = {
  live: { label: "可预约", tone: "success" },
  beta: { label: "内测中", tone: "warning" },
  soon: { label: "即将上线", tone: "neutral" },
};

// TikTok Shop 主要目标市场。"global" = 与市场无关（如客服、收款），卡片上标注为「全球通用」。
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

// ── 对接配置 ──────────────────────────────────────────────────────────
// 「预约咨询」弹窗里的联系方式。填好任意一项即生效；全留空则弹窗显示占位提示 + 邮件兜底。
const CONTACT = {
  wecomUrl: "", // 企业微信「联系我」活码链接 → 自动渲染成二维码，扫码即加顾问
  qrImageSrc: "", // 或：客服微信/企微二维码图片，放进 public/ 后填路径，如 "/contact-qr.png"
  wechatId: "", // 备用：客服微信号，弹窗内展示并支持一键复制
  email: "hello@oneclaw.ai", // 兜底：始终展示的邮件入口
};

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
        desc: "对接主流头程专线与海外仓渠道，下单前一键比价选最优线路，发出后轨迹自动同步、异常件主动提醒。适合刚起量、还没有固定货代的新卖家。",
        icon: Truck,
        status: "beta",
        tags: ["多渠道比价", "轨迹同步", "异常提醒"],
        regions: ["us", "uk", "sea", "mx", "eu", "me"],
      },
      {
        label: "海外仓",
        desc: "主流市场的本地仓资源：一件代发、退货换标、本地尾程配送，旺季不爆仓、时效更稳。适合已有稳定出单、想把物流体验做上去的卖家。",
        icon: Warehouse,
        status: "soon",
        tags: ["一件代发", "退换处理", "本地尾程"],
        regions: ["us", "uk", "sea", "eu", "mx"],
      },
      {
        label: "清关报关",
        desc: "进出口报关与商品合规申报由持牌报关行代理，发货前预审品类资质，避免卡关与扣货。适合带电、美妆等对合规敏感的品类。",
        icon: PackageCheck,
        status: "soon",
        tags: ["进出口", "合规申报", "品类预审"],
        regions: ["us", "uk", "sea", "eu", "mx", "me"],
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
        desc: "帮你筛选匹配品类的带货达人，代发建联、跟进寄样与佣金方案，进展定期同步，避免寄了样没下文。适合没有海外 BD 团队的卖家。",
        icon: Users,
        status: "beta",
        tags: ["建联寄样", "佣金管理", "进展同步"],
        regions: ["us", "uk", "sea", "mx"],
      },
      {
        label: "直播代播",
        desc: "本土主播团队按时段排期代播，含直播脚本、货品讲解与场后数据复盘。适合想试水直播、但还养不起自有主播的卖家。",
        icon: Radio,
        status: "soon",
        tags: ["多时段排期", "脚本支持", "场后复盘"],
        regions: ["sea", "us", "uk"],
      },
      {
        label: "广告开户",
        desc: "TikTok 广告账户开户，GMV Max 计划搭建与托管优化，预算消耗与投产周度汇报。适合自然流量见顶、想放量的店铺。",
        icon: Megaphone,
        status: "soon",
        tags: ["GMV Max", "托管优化", "周度汇报"],
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
        desc: "对接主流跨境收款通道，多币种结汇、低费率提现到国内账户，到账时效与汇损透明可查。开店第一步就能用上。",
        icon: Wallet,
        status: "live",
        tags: ["多币种", "低费率", "透明汇损"],
        regions: ["global"],
      },
      {
        label: "税务合规",
        desc: "VAT / 销售税注册与按期代理申报，申报节点自动提醒，远离平台合规下架风险。适合已在英欧市场稳定出单的卖家。",
        icon: ReceiptText,
        status: "soon",
        tags: ["VAT 注册", "代理申报", "到期提醒"],
        regions: ["us", "uk", "eu"],
      },
      {
        label: "公司与店铺",
        desc: "海外公司主体注册、TikTok Shop 入驻资质材料准备与提审跟进，一站式办妥。适合想从个人店升级为正规主体经营的卖家。",
        icon: ShieldCheck,
        status: "soon",
        tags: ["主体注册", "入驻资质", "提审跟进"],
        regions: ["us", "uk", "sea", "eu"],
      },
    ],
  },
];

// 适用市场展示文案：含 global 显示「全球通用」，否则列出市场名。
function regionText(svc: Service) {
  if (svc.regions.includes("global")) return "全球通用";
  return svc.regions.map((r) => REGION_LABEL[r]).join(" · ");
}

export default function ServicesPage() {
  // 「预约咨询」弹窗的当前咨询主题：null = 关闭，非空字符串 = 打开并显示该主题。
  const [contactTopic, setContactTopic] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="服务"
        description="把跨境经营全链路要用到的外部能力聚合到一处：物流、达人、收款、财税…… 按经营环节分门别类，逐步开放对接。"
      />

      <div className="space-y-8">
        {CATEGORIES.map((c) => (
          <section key={c.key} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">{c.label}</h2>
              <p className="mt-0.5 text-xs text-zinc-400">{c.desc}</p>
            </div>

            <div className="space-y-3">
              {c.services.map((svc) => (
                <ServiceCard key={svc.label} service={svc} onContact={setContactTopic} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-zinc-100 pt-5 text-center">
        <p className="text-xs text-zinc-400">没找到需要的服务，或想加快某个对接？</p>
        <button
          onClick={() => setContactTopic("其他服务需求")}
          className="mt-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          预约咨询，告诉我们你的优先级 →
        </button>
      </div>

      <ContactModal topic={contactTopic} onClose={() => setContactTopic(null)} />
    </div>
  );
}

function ServiceCard({
  service,
  onContact,
}: {
  service: Service;
  onContact: (topic: string) => void;
}) {
  const { label, desc, icon: Icon, status, tags } = service;
  const meta = STATUS_META[status];
  // 可预约 / 内测中 = 现在就能对接，亮色卡；即将上线 = 灰卡，弱化但仍可留资。
  const actionable = status !== "soon";

  return (
    <div
      className={
        "rounded-xl border p-5 transition-colors sm:flex sm:items-center sm:gap-4 " +
        (actionable
          ? "border-zinc-200/80 bg-white hover:border-brand-200 hover:bg-brand-50/30"
          : "border-zinc-100 bg-zinc-50/60")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
              (actionable ? "bg-brand-50 text-brand-500" : "bg-zinc-100 text-zinc-400")
            }
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <span className="font-medium text-zinc-900">{label}</span>
          <Badge tone={meta.tone} outline={false}>
            {meta.label}
          </Badge>
          <span className="text-2xs text-zinc-400">适用 · {regionText(service)}</span>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{desc}</p>

        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-2xs text-zinc-500">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        variant={status === "live" ? "primary" : status === "beta" ? "secondary" : "ghost"}
        size="sm"
        className="mt-4 w-full shrink-0 sm:mt-0 sm:w-auto"
        onClick={() => onContact(label)}
      >
        <Headset className="h-3.5 w-3.5" />
        {status === "beta" ? "申请内测" : "预约咨询"}
      </Button>
    </div>
  );
}

function ContactModal({ topic, onClose }: { topic: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  // ESC 关闭（仅在打开时挂监听）。
  useEffect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [topic, onClose]);

  if (!topic) return null;

  const hasQr = Boolean(CONTACT.qrImageSrc || CONTACT.wecomUrl);

  function copyWechat() {
    if (!CONTACT.wechatId) return;
    navigator.clipboard.writeText(CONTACT.wechatId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Headset className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm font-bold text-zinc-900">预约咨询</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-zinc-600">
            你正在咨询：<span className="font-medium text-zinc-900">{topic}</span>。
            扫码加专属顾问，我们一对一帮你对接。
          </p>

          <div className="flex flex-col items-center gap-2">
            <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-zinc-100 bg-white p-3">
              {CONTACT.qrImageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={CONTACT.qrImageSrc}
                  alt="顾问二维码"
                  className="h-full w-full object-contain"
                />
              ) : CONTACT.wecomUrl ? (
                <QRCodeSVG value={CONTACT.wecomUrl} size={168} level="M" bgColor="#fff" fgColor="#18181b" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-300">
                  <QrCode className="h-10 w-10" />
                  <span className="text-2xs text-zinc-400">顾问二维码即将开放</span>
                </div>
              )}
            </div>
            <p className="text-2xs text-zinc-400">
              {hasQr ? "微信扫码，添加专属顾问" : "二维码配置中，可先用下方方式联系"}
            </p>
          </div>

          {CONTACT.wechatId && (
            <button
              onClick={copyWechat}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-50 py-2 text-xs text-zinc-600 transition-colors hover:bg-zinc-100"
            >
              微信号 <span className="font-medium text-zinc-900">{CONTACT.wechatId}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-zinc-400" />
              )}
            </button>
          )}

          <p className="text-center text-2xs text-zinc-400">
            或邮件{" "}
            <a href={`mailto:${CONTACT.email}`} className="text-brand-600 hover:text-brand-700">
              {CONTACT.email}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
