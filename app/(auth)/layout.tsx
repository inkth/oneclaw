import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLockup } from "@/components/ui/BrandMark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="gradient-bg relative flex min-h-screen flex-col overflow-hidden bg-[#f7f6f2]">
      <div className="app-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="pointer-events-none absolute -right-20 top-24 h-72 w-72 rounded-full bg-brand-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 bottom-12 h-80 w-80 rounded-full bg-ai-violet/10 blur-3xl" />
      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <Link href="/intro" aria-label="发现猫首页" className="rounded-xl">
          <BrandLockup tileClassName="h-9 w-9 rounded-[11px]" />
        </Link>
        <Link href="/intro" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/70 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回首页
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-12 pt-2 sm:px-6 sm:pb-16">
        <div className="w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
