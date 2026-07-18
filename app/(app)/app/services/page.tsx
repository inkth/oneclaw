"use client";

import { useState } from "react";
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
  Boxes,
  TrendingUp,
  Landmark,
  Handshake,
  Headset,
  Phone,
  MessageCircle,
  Mail,
  Copy,
  Check,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogShell } from "@/components/ui/Dialog";
import {
  CATEGORIES,
  CONTACT,
  STATUS_META,
  regionText,
  type Category,
  type Partner,
  type Service,
} from "./data";

// 服务板块 = 跨境经营全链路要用到的「外部能力」目录。数据在 ./data.ts，这里只负责渲染。
// 排版：每个分类一张分组卡（表头 + 分隔行）；标注了合作方的服务，「预约咨询」直接展示其联系方式。

// 图标名 → 组件映射（数据文件里图标存的是字符串名，便于日后由后端接管）。
const ICONS: Record<string, LucideIcon> = {
  Truck,
  Warehouse,
  PackageCheck,
  Users,
  Radio,
  Wallet,
  ReceiptText,
  ShieldCheck,
  Megaphone,
  Boxes,
  TrendingUp,
  Landmark,
};

// 分类色调 → 表头图标色签。
const ACCENT: Record<Category["accent"], string> = {
  sky: "bg-sky-50 text-sky-600 ring-sky-100",
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

// 「预约咨询」弹窗的目标：标题 + 该服务的合作方（有则直接展示其联系方式，无则走平台兜底）。
type ContactTarget = { title: string; partners?: Partner[] };

export default function ServicesPage() {
  const [contact, setContact] = useState<ContactTarget | null>(null);
  const totalServices = CATEGORIES.reduce((sum, category) => sum + category.services.length, 0);
  const liveServices = CATEGORIES.reduce(
    (sum, category) => sum + category.services.filter((service) => service.status !== "soon").length,
    0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="服务"
        description="集中寻找物流、达人、公司注册等出海服务；可对接项目会直接提供联系方式。"
        badge={
          <Badge tone="success" outline={false}>
            {liveServices}/{totalServices} 可对接
          </Badge>
        }
      />

      <nav aria-label="服务分类" className="grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((category) => {
          const Icon = ICONS[category.icon] ?? Boxes;
          const available = category.services.filter((service) => service.status !== "soon").length;
          return (
            <a
              key={category.key}
              href={`#service-${category.key}`}
              className="dk-lift group flex items-center gap-3 rounded-2xl border border-black/[0.065] bg-white p-4 shadow-[0_1px_2px_rgba(18,20,25,.025)]"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${ACCENT[category.accent]}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{category.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-400">{available} 项当前可对接</span>
              </span>
              <ChevronRight className="h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
            </a>
          );
        })}
      </nav>

      <div className="space-y-5">
        {CATEGORIES.map((c) => {
          const CatIcon = ICONS[c.icon] ?? Boxes;
          const liveCount = c.services.filter((s) => s.status !== "soon").length;
          return (
            <section key={c.key} id={`service-${c.key}`} className="scroll-mt-24">
              <Card padded={false} className="overflow-hidden">
                <header className="flex items-center gap-3 border-b border-[var(--dk-stroke-divider)] bg-[var(--dk-surface-2)] px-5 py-3.5">
                  <span
                    className={
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 " + ACCENT[c.accent]
                    }
                  >
                    <CatIcon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold leading-tight text-[var(--dk-content-primary)]">{c.label}</h2>
                    <p className="mt-0.5 truncate text-xs text-[var(--dk-content-tertiary)]">{c.desc}</p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-lg border border-[var(--dk-stroke-border)] bg-white px-2.5 py-0.5 text-2xs text-[var(--dk-content-secondary)]">
                    {liveCount}/{c.services.length} 可对接
                  </span>
                </header>

                <div className="divide-y divide-[var(--dk-stroke-divider)]">
                  {c.services.map((svc) => (
                    <ServiceRow key={svc.label} service={svc} onContact={setContact} />
                  ))}
                </div>
              </Card>
            </section>
          );
        })}
      </div>

      <div className="pt-1">
        <p className="px-4 text-center text-2xs leading-relaxed text-[var(--dk-content-tertiary)]">
          标注「合作方」的服务由第三方渠道提供，发现猫仅做筛选与对接引导、不对其资质与结果作担保或背书；
          合作条款、收费与交付以你与合作方另行约定为准。
        </p>
      </div>

      <ContactModal target={contact} onClose={() => setContact(null)} />
    </div>
  );
}

function ServiceRow({
  service,
  onContact,
}: {
  service: Service;
  onContact: (target: ContactTarget) => void;
}) {
  const { label, desc, icon, status, tags, partners } = service;
  const Icon = ICONS[icon] ?? Headset;
  const meta = STATUS_META[status];
  // 可预约 / 内测中 = 现在就能对接，图标高亮；即将上线 = 弱化。
  const actionable = status !== "soon";
  const hasPartners = Boolean(partners && partners.length > 0);

  return (
    <div className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-[var(--dk-action-regular)] sm:flex-row sm:items-start">
      <div
        className={
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl " +
          (actionable ? "bg-brand-50 text-brand-500" : "bg-[var(--dk-surface-2)] text-[var(--dk-content-tertiary)]")
        }
      >
        <Icon className="h-4.5 w-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-[var(--dk-content-primary)]">{label}</span>
          <Badge tone={meta.tone} outline={false}>
            {meta.label}
          </Badge>
          {hasPartners && (
            <Badge tone="neutral" outline>
              合作方
            </Badge>
          )}
          <span className="text-2xs text-[var(--dk-content-tertiary)]">适用 · {regionText(service)}</span>
        </div>

        <p className="mt-1.5 text-sm leading-relaxed text-[var(--dk-content-secondary)]">{desc}</p>

        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-lg bg-[var(--dk-surface-2)] px-1.5 py-0.5 text-2xs text-[var(--dk-content-secondary)]">
                {t}
              </span>
            ))}
          </div>
        )}

        {hasPartners && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-[var(--dk-content-tertiary)]">
            <Handshake className="h-3 w-3 shrink-0 text-[var(--dk-content-tertiary)]" />
            <span>渠道</span>
            {partners!.map((p) => (
              <span key={p.name} className="text-[var(--dk-content-secondary)]" title={p.note}>
                {p.name}
              </span>
            ))}
            <span className="text-[var(--dk-content-tertiary)]">·</span>
            <span className="text-[var(--dk-content-tertiary)]">非平台背书</span>
          </div>
        )}
      </div>

      <Button
        variant={status === "live" ? "primary" : status === "beta" ? "secondary" : "ghost"}
        size="sm"
        className="w-full shrink-0 sm:w-auto"
        onClick={() => actionable && onContact({ title: label, partners })}
        disabled={!actionable}
      >
        <Headset className="h-3.5 w-3.5" />
        {status === "beta" ? "申请内测" : status === "soon" ? "暂未开放" : "预约咨询"}
      </Button>
    </div>
  );
}

// 单条联系方式：可点（拨打 / 发信）+ 可复制。
function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--dk-surface-2)] px-3 py-2.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--dk-content-tertiary)]" />
      <span className="w-8 shrink-0 text-2xs text-[var(--dk-content-tertiary)]">{label}</span>
      {href ? (
        <a href={href} className="flex-1 truncate text-xs font-medium text-[var(--dk-content-primary)] hover:text-brand-600">
          {value}
        </a>
      ) : (
        <span className="flex-1 truncate text-xs font-medium text-[var(--dk-content-primary)]">{value}</span>
      )}
      <button
        onClick={copy}
        aria-label={`复制${label}`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--dk-content-tertiary)] transition-colors hover:bg-[var(--dk-action-regular)] hover:text-[var(--dk-content-secondary)]"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// 合作方联系卡：机构名 + 资质 + 联系方式（电话/微信/邮箱）。
function PartnerBlock({ partner }: { partner: Partner }) {
  const hasContact = Boolean(partner.phone || partner.wechat || partner.email);
  return (
    <div className="rounded-xl border border-[var(--dk-stroke-border)] bg-white p-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-3.5 w-3.5 shrink-0 text-brand-500" />
        <span className="text-sm font-semibold text-[var(--dk-content-primary)]">{partner.name}</span>
      </div>
      {partner.note && <p className="mt-0.5 text-2xs text-[var(--dk-content-tertiary)]">{partner.note}</p>}
      {hasContact ? (
        <div className="mt-3 space-y-1.5">
          {partner.phone && (
            <ContactRow
              icon={Phone}
              label="电话"
              value={partner.phone}
              href={`tel:${partner.phone.replace(/\s/g, "")}`}
            />
          )}
          {partner.wechat && <ContactRow icon={MessageCircle} label="微信" value={partner.wechat} />}
          {partner.email && (
            <ContactRow icon={Mail} label="邮箱" value={partner.email} href={`mailto:${partner.email}`} />
          )}
        </div>
      ) : (
        <p className="mt-2 text-2xs text-[var(--dk-content-tertiary)]">联系方式整理中，可先用页脚方式联系我们。</p>
      )}
    </div>
  );
}

function ContactModal({ target, onClose }: { target: ContactTarget | null; onClose: () => void }) {
  if (!target) return null;

  const partners = target.partners ?? [];
  const hasPartners = partners.length > 0;

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="service-contact-title"
      panelClassName="max-w-sm"
    >
        <header className="flex items-center border-b border-[var(--dk-stroke-divider)] px-5 py-3.5 pr-14">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Headset className="h-3.5 w-3.5" />
            </div>
            <h2 id="service-contact-title" className="text-sm font-bold text-[var(--dk-content-primary)]">预约咨询</h2>
          </div>
        </header>

        <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-[var(--dk-content-secondary)]">
            你正在咨询：<span className="font-medium text-[var(--dk-content-primary)]">{target.title}</span>。
          </p>

          {hasPartners ? (
            <>
              <p className="text-2xs leading-relaxed text-[var(--dk-content-tertiary)]">
                以下为该服务合作方的联系方式，可直接联系对接 · 发现猫非平台背书。
              </p>
              <div className="space-y-3">
                {partners.map((p) => (
                  <PartnerBlock key={p.name} partner={p} />
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2 rounded-xl border border-[var(--dk-stroke-border)] bg-[var(--dk-surface-2)] p-4">
              <p className="text-sm leading-relaxed text-[var(--dk-content-secondary)]">
                这项暂未接入合作方。留下需求，我们帮你筛选对接：
              </p>
              <p className="text-xs text-[var(--dk-content-secondary)]">
                邮件{" "}
                <a href={`mailto:${CONTACT.email}`} className="font-medium text-brand-600 hover:text-brand-700">
                  {CONTACT.email}
                </a>
              </p>
            </div>
          )}
        </div>
    </DialogShell>
  );
}
