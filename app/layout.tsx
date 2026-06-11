import type { Metadata } from "next";
import { Poppins, Open_Sans } from "next/font/google";
import "./globals.css";
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
  title: "OneClaw · 你的 AI 出海团队",
  description:
    "OneClaw 用 AI Agent 帮你完成跨境电商从选品分析、短视频创作、Listing 内容到投放复盘的全链路，让 30+ 小时工作 10 分钟搞定。",
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
