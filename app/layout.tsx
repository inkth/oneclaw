import type { Metadata } from "next";
import "./globals.css";
// 拉丁字体通过 Fontsource 自托管，避免构建期依赖 Google Fonts 网络。
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/open-sans/latin-300.css";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-500.css";
import "@fontsource/open-sans/latin-600.css";
import "@fontsource/open-sans/latin-700.css";
import "@fontsource/open-sans/latin-800.css";
// 专业中文字体（思源黑体 Noto Sans SC，SIL OFL）：标题优先 —— 仅 600/700 两字重，
// 且仅「中文简体」子集（西文/数字走 Poppins，不拉 latin/日韩/西里尔等无关字符集）。
// font-family "Noto Sans SC" 经 globals.css 的 --font-cjk 接入标题链；fontsource 默认 display:swap。
import "@fontsource/noto-sans-sc/chinese-simplified-600.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import { Toaster } from "sonner";
import { BRAND_NAME, BRAND_SLOGAN } from "@/lib/brand";

export const metadata: Metadata = {
  // 没有 metadataBase 时 og:image 会回退成 localhost:3000 的绝对 URL,
  // 分享到微信/X 时对方抓 localhost 必然失败，卡片出不来。生产走真域名,
  // 本地开发仍回落 localhost。设了 NEXT_PUBLIC_SITE_URL 则以它为准。
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.NODE_ENV === "production"
        ? "https://faxianmao.com"
        : "http://localhost:3000"),
  ),
  title: `${BRAND_NAME} · ${BRAND_SLOGAN}`,
  description:
    `${BRAND_SLOGAN}。${BRAND_NAME} 用 AI Agent 帮你完成跨境电商从选品分析、短视频创作、Listing 内容到投放复盘的全链路，榜单数据免费逛，一句话就能派活。`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "font-sans",
            },
          }}
        />
      </body>
    </html>
  );
}
