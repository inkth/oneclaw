import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

// 法律页通用外壳：站点 Header/Footer + 居中正文排版。服务条款 / 隐私政策共用。
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
        <article
          className="text-sm leading-relaxed text-zinc-600
            [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-zinc-900
            [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-900
            [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5
            [&_a]:text-brand-600 [&_a]:underline [&_strong]:text-zinc-900 [&_strong]:font-medium"
        >
          {children}
        </article>
      </main>
      <Footer />
    </div>
  );
}
