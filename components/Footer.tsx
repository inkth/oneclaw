import { Mail, MessageSquare } from "lucide-react";
import { BrandLockup } from "@/components/ui/BrandMark";
import { SubscribeForm } from "./SubscribeForm";

const sections: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "产品",
    links: [
      { label: "全链路", href: "/intro#chain" },
      { label: "AI 团队", href: "/intro#team" },
      { label: "定价方案", href: "/pricing" },
    ],
  },
  {
    title: "解决方案",
    links: [
      { label: "独立站团队", href: "/pricing" },
      { label: "TikTok 卖家", href: "/pricing" },
      { label: "MCN / 服务商", href: "/pricing" },
    ],
  },
  {
    title: "资源",
    links: [
      { label: "登录", href: "/login" },
      { label: "注册", href: "/login" },
      { label: "工作台", href: "/app" },
    ],
  },
  {
    title: "公司",
    links: [
      { label: "联系我们", href: "mailto:hello@oneclaw.ai" },
      { label: "服务条款", href: "/legal/terms" },
      { label: "隐私政策", href: "/legal/privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-zinc-200/80 bg-zinc-50/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          <div className="col-span-2">
            <BrandLockup tileClassName="h-8 w-8 rounded-lg" />
            <p className="mt-4 text-sm text-zinc-600 leading-relaxed max-w-xs">
              用 AI Agent 团队，把跨境电商的重复工作交给机器，
              让每一个出海人都能像团队一样高效。
            </p>
            <div className="mt-6 flex flex-col gap-2 text-sm text-zinc-600">
              <a href="mailto:hello@oneclaw.ai" className="inline-flex items-center gap-2 hover:text-brand-600">
                <Mail className="h-4 w-4" />
                hello@oneclaw.ai
              </a>
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                微信公众号：发现猫 出海
              </span>
            </div>
          </div>

          {sections.map((s) => (
            <div key={s.title}>
              <div className="text-sm font-semibold text-zinc-900">{s.title}</div>
              <ul className="mt-4 space-y-2.5">
                {s.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-zinc-600 hover:text-brand-600 transition-colors">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-zinc-200/80 bg-white p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">订阅出海周报</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              每周一封，AI 出海赛道动态 + 选品趋势 + 案例拆解。
            </div>
          </div>
          <SubscribeForm />
        </div>

        <div className="mt-12 border-t border-zinc-200/80 pt-6 text-xs text-zinc-500">
          © 2026 发现猫科技. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
