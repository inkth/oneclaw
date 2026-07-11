import type { Metadata } from "next";
import { Poppins, Open_Sans } from "next/font/google";
import "./globals.css";
// 专业中文字体（思源黑体 Noto Sans SC，SIL OFL）：标题优先 —— 仅 600/700 两字重，
// 且仅「中文简体」子集（西文/数字走 Poppins，不拉 latin/日韩/西里尔等无关字符集）。
// font-family "Noto Sans SC" 经 globals.css 的 --font-cjk 接入标题链；fontsource 默认 display:swap。
import "@fontsource/noto-sans-sc/chinese-simplified-600.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import { Toaster } from "sonner";

// 照搬 Designkit：标题 Poppins，正文 Open Sans。
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

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
  title: "发现猫 · 你的 AI 出海团队",
  description:
    "发现猫用 AI Agent 帮你完成跨境电商从选品分析、短视频创作、Listing 内容到投放复盘的全链路，榜单数据免费逛，一句话就能派活。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${poppins.variable} ${openSans.variable} h-full antialiased`}
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
