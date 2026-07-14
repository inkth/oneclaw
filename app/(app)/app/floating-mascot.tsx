"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Clapperboard,
  Compass,
  ImagePlus,
  MessageSquarePlus,
  PackageSearch,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";

type ContextAction = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NEW_TASK = "/app/agents/new#agent-composer";

function taskHref(agent: string, prompt: string) {
  return `/app/agents/new?agent=${agent}&prompt=${encodeURIComponent(prompt)}#agent-composer`;
}

function actionFor(pathname: string): ContextAction {
  if (pathname.startsWith("/app/discover/products")) {
    return { label: "开始选品判断", href: taskHref("ANALYST", "请帮我判断当前看到的商品是否值得做，并给出下一步建议。"), icon: PackageSearch };
  }
  if (pathname.startsWith("/app/discover/influencers")) {
    return { label: "评估达人合作", href: taskHref("ADVISOR", "请帮我评估当前达人是否值得合作，并给出合作建议。"), icon: UsersRound };
  }
  if (pathname.startsWith("/app/discover/sellers")) {
    return { label: "分析店铺机会", href: taskHref("ANALYST", "请帮我分析当前店铺的机会、风险和下一步动作。"), icon: Compass };
  }
  if (pathname.startsWith("/app/discover/videos")) {
    return { label: "拆解带货视频", href: taskHref("DIRECTOR", "请帮我拆解当前视频的带货结构，并给出可复用的创作建议。"), icon: Clapperboard };
  }
  if (pathname.startsWith("/app/assets/materials")) {
    return { label: "用素材开始创作", href: taskHref("DIRECTOR", "请基于我的素材，帮我规划一条带货短视频。"), icon: ImagePlus };
  }
  if (pathname.startsWith("/app/assets/products")) {
    return { label: "生成商品内容", href: taskHref("LISTING", "请为我的商品生成 TikTok Shop Listing 内容。"), icon: WandSparkles };
  }
  if (pathname.startsWith("/app/videos")) {
    return { label: "优化视频脚本", href: taskHref("DIRECTOR", "请帮我优化当前视频的脚本与转化表达。"), icon: Clapperboard };
  }
  if (pathname.startsWith("/app/services")) {
    return { label: "规划经营下一步", href: taskHref("ADVISOR", "请根据我的跨境经营目标，建议下一步优先做什么。"), icon: BarChart3 };
  }
  return { label: "发起新任务", href: NEW_TASK, icon: MessageSquarePlus };
}

/**
 * 情境助手：只保留一个静态猫头标记和当前页最相关的下一步操作。
 * 不漂浮、不弹出通用菜单；它是任务入口，而不是抢占注意力的装饰物。
 */
export function FloatingMascot() {
  const pathname = usePathname();
  const action = actionFor(pathname);
  const Icon = action.icon;

  return (
    <div className="fixed bottom-[76px] right-3 z-50 md:bottom-5 md:right-6">
      <Link
        href={action.href}
        className="group inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.09] bg-white py-1.5 pl-1.5 pr-3 text-sm font-semibold text-ink shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4"
        aria-label={action.label}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white">
          <BrandMark className="h-5 w-5" />
        </span>
        <Icon className="h-3.5 w-3.5 text-brand-600" aria-hidden />
        <span className="max-w-36 truncate">{action.label}</span>
      </Link>
    </div>
  );
}
