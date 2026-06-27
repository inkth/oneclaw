import Link from "next/link";
import { BrandLockup } from "@/components/ui/BrandMark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      <div className="absolute inset-0 gradient-bg" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-[40rem] -translate-x-1/2 aura-violet"
      />
      <header className="relative px-6 py-5">
        <Link href="/" aria-label="发现猫 首页">
          <BrandLockup tileClassName="h-8 w-8 rounded-lg" />
        </Link>
      </header>
      <main className="relative flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
