/**
 * 起步模板：每个新工作台默认就能用的预设组合。
 * 这些不入库，跟用户自建模板拼在一起展示。
 */
import type { VideoStyle } from "@prisma/client";

export type StarterTemplate = {
  id: string; // "starter:xxx" 前缀，区分用户模板
  emoji: string;
  name: string;
  description: string;
  engine: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: VideoStyle;
  promptTemplate: string;
  generateScript: boolean;
  generateCover: boolean;
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "starter:tiktok-unbox",
    emoji: "📦",
    name: "TikTok 开箱热爆款",
    description: "9:16 竖屏，5 秒手部开箱特写，强光影",
    engine: "kling-standard",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "UNBOXING",
    promptTemplate:
      "近景手部从牛皮纸包装中取出商品的开箱过程，干净台面、自然光，2 秒内完整露出商品正面，最后定格 LOGO 特写。9:16 竖屏。",
    generateScript: true,
    generateCover: true,
  },
  {
    id: "starter:beauty-before-after",
    emoji: "✨",
    name: "美妆 Before/After",
    description: "10s 前后对比，强反差，适合护肤 / 美妆",
    engine: "kling-pro",
    durationSec: 10,
    aspectRatio: "9:16",
    style: "BEFORE_AFTER",
    promptTemplate:
      "分屏前后对比镜头，左侧问题肌肤特写（暗沉、细纹），右侧使用商品后净透饱满；中段化身揭示产品包装，最终淡入 CTA。柔光、暖色调。9:16。",
    generateScript: true,
    generateCover: true,
  },
  {
    id: "starter:pet-cute",
    emoji: "🐶",
    name: "宠物治愈卖萌",
    description: "Luma 电影感慢镜头，狗狗 / 猫使用产品的暖心场景",
    engine: "luma-dream",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "客厅地毯上小型犬 / 猫使用商品的慢动作镜头，毛发丝丝可见，温暖橘色 hour 光，结尾镜头拉远展示包装。9:16 cinematic。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:logo-rotate",
    emoji: "🌀",
    name: "Logo 旋转展示",
    description: "图生视频：上传一张商品图，让它 360° 旋转",
    engine: "kling-i2v",
    durationSec: 5,
    aspectRatio: "1:1",
    style: "SCENE",
    promptTemplate:
      "商品在纯色背景上缓慢 360° 旋转，柔和光带扫过表面突出材质细节，结尾停在正面 LOGO。所有设计取自首帧。",
    generateScript: false,
    generateCover: false,
  },
  {
    id: "starter:talking-host",
    emoji: "🎤",
    name: "数字人口播 6 秒",
    description: "MiniMax 海螺，自然中文口播带货",
    engine: "minimax-hailuo",
    durationSec: 6,
    aspectRatio: "16:9",
    style: "SCENE",
    promptTemplate:
      "中文女主播半身镜头，浅色客厅背景，手持商品自然口播：「这款 XX 你一定要试试，便宜又好用」。结尾 1 秒淡入价格 / 链接。",
    generateScript: true,
    generateCover: true,
  },
  {
    id: "starter:compare-vs",
    emoji: "⚖️",
    name: "对比测评",
    description: "你的商品 vs 友商，突出差异化",
    engine: "kling-standard",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "COMPARISON",
    promptTemplate:
      "左侧老款 / 友商产品笨重难用、右侧本商品轻便顺滑，分屏快速切换 3 次，每次定格关键卖点字幕。结尾合并显示「选 XX」。",
    generateScript: true,
    generateCover: true,
  },
];

export function getStarterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}
