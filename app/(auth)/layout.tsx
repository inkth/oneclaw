import Link from "next/link";
import { BrandLockup } from "@/components/ui/BrandMark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="gradient-bg relative flex min-h-screen flex-col overflow-hidden">
      <div className="app-grid pointer-events-none absolute inset-0 opacity-45" />
      <div className="pointer-events-none absolute -right-20 top-24 h-72 w-72 rounded-full bg-brand-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 bottom-12 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />
      <header className="relative px-6 py-6 sm:px-8">
        <Link href="/" aria-label="发现猫首页">
          <BrandLockup tileClassName="h-10 w-10 rounded-xl" />
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
