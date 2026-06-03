import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  // standalone 模式：构建产物自包含，部署时只需复制 .next/standalone 即可运行
  output: "standalone",
  // 显式设置 turbopack root 避免 worktree 嵌套导致 standalone 路径异常
  turbopack: {
    root: resolve(import.meta.dirname),
  },
};

export default nextConfig;
