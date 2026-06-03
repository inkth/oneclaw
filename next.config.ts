import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  // standalone 模式：构建产物自包含，部署时只需复制 .next/standalone 即可运行
  output: "standalone",
  // 显式设置 turbopack root 避免 worktree 嵌套导致 standalone 路径异常
  turbopack: {
    root: resolve(import.meta.dirname),
  },
  // wechatpay-node-v3 -> superagent -> formidable 内部用 dynamic require，
  // Turbopack 静态分析时无法解析。这里把这些包标为 server external，运行时再 require。
  serverExternalPackages: [
    "wechatpay-node-v3",
    "alipay-sdk",
    "tencentcloud-sdk-nodejs-sms",
    "cos-nodejs-sdk-v5",
    "superagent",
    "formidable",
  ],
};

export default nextConfig;
