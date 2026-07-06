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
  Handshake,
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
import {
  CATEGORIES,
  CONTACT,
  STATUS_META,
  regionText,
  type Service,
} from "./data";

// 服务板块 = 跨境经营全链路要用到的「外部能力」目录。数据在 ./data.ts，这里只负责渲染。
// 标注了合作方的服务由第三方渠道提供，联系统一走「预约咨询」由平台居中对接（非平台背书）。

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
};

export default function ServicesPage() {
  // 「预约咨询」弹窗的当前咨询主题：null = 关闭，非空字符串 = 打开并显示该主题。
  const [contactTopic, setContactTopic] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="服务"
        description="把跨境经营全链路要用到的外部能力聚合到一处：物流、达人、收款、财税…… 标注「合作方」的由第三方渠道提供，平台居中引导对接、非平台背书。"
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

      <div className="space-y-3 border-t border-zinc-100 pt-5">
        <div className="text-center">
          <p className="text-xs text-zinc-400">没找到需要的服务，或想加快某个对接？</p>
          <button
            onClick={() => setContactTopic("其他服务需求")}
            className="mt-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
          >
            预约咨询，告诉我们你的优先级 →
          </button>
        </div>
        <p className="text-center text-2xs leading-relaxed text-zinc-300">
          标注「合作方」的服务由第三方渠道提供，发现猫仅做筛选与对接引导、不对其资质与结果作担保或背书；
          合作条款、收费与交付以你与合作方另行约定为准。
        </p>
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
  const { label, desc, icon, status, tags, partners } = service;
  const Icon = ICONS[icon] ?? Headset;
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
          {partners && partners.length > 0 && (
            <Badge tone="neutral" outline>
              合作方
            </Badge>
          )}
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

        {partners && partners.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-zinc-400">
            <Handshake className="h-3 w-3 shrink-0 text-zinc-400" />
            <span>渠道</span>
            {partners.map((p) => (
              <span key={p.name} className="text-zinc-500" title={p.note}>
                {p.name}
              </span>
            ))}
            <span className="text-zinc-300">·</span>
            <span className="text-zinc-400">非平台背书</span>
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
            扫码加专属顾问，由我们帮你对接并把关。
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
