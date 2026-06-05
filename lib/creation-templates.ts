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

  // —— 3C / 数码 ——
  {
    id: "starter:3c-fastcharge",
    emoji: "🔋",
    name: "快充对比演示",
    description: "充电宝 / 数码，电量飙升强对比",
    engine: "kling-standard",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "COMPARISON",
    promptTemplate:
      "桌面上手机电量数字快速跳涨的特写，旁边商品指示灯依次亮起；分屏左侧旧设备充电缓慢、右侧本品快充飙升，快节奏剪辑，结尾定格容量数字与品牌字样。9:16 竖屏，冷色科技光。",
    generateScript: true,
    generateCover: true,
  },
  {
    id: "starter:3c-unbox-premium",
    emoji: "🖤",
    name: "数码仪式感开箱",
    description: "10s 暗调影棚，逐层揭盖的高级开箱",
    engine: "kling-pro",
    durationSec: 10,
    aspectRatio: "9:16",
    style: "UNBOXING",
    promptTemplate:
      "暗色桌面打光，双手缓慢揭开高级包装盒盖、抽出内衬托盘逐层露出数码产品的仪式感开箱，镜头贴近金属与玻璃质感，结尾点亮设备屏幕定格。9:16，影棚硬光。",
    generateScript: true,
    generateCover: true,
  },

  // —— 美妆 / 护肤 ——
  {
    id: "starter:lipstick-swatch",
    emoji: "💄",
    name: "口红试色横扫",
    description: "膏体丝滑显色 + 上唇前后",
    engine: "kling-pro",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "口红膏体在手背上一笔扫开的微距镜头，丝滑显色；镜头上移到模特嘴唇上色前后对比，柔光棚拍，结尾多支色号排列缓慢旋转展示。9:16，高级感暖光。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:serum-texture",
    emoji: "💧",
    name: "精华质地拉丝",
    description: "Luma 微距，晶莹拉丝吸收",
    engine: "luma-dream",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "玻璃滴管滴下精华液、在大理石台面拉出晶莹丝线的慢动作微距，光线穿透液体折射；随后涂抹于肌肤迅速吸收，电影感浅景深，结尾产品立于台面。9:16。",
    generateScript: false,
    generateCover: true,
  },

  // —— 家居 / 厨房 ——
  {
    id: "starter:storage-tidy",
    emoji: "🧺",
    name: "收纳整理对比",
    description: "10s 杂乱到整齐的同机位反差",
    engine: "kling-pro",
    durationSec: 10,
    aspectRatio: "9:16",
    style: "BEFORE_AFTER",
    promptTemplate:
      "杂乱抽屉 / 衣柜的俯拍，快速过渡到使用收纳产品后整齐分格的同机位画面，前后强烈反差；中段手部摆放演示，结尾干净全景淡入 CTA。9:16，明亮自然光。",
    generateScript: true,
    generateCover: true,
  },
  {
    id: "starter:kitchen-gadget",
    emoji: "🍳",
    name: "厨房好物演示",
    description: "多功能小工具连续操作特写",
    engine: "kling-standard",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "明亮厨房台面，手部用商品快速切菜 / 榨汁 / 打蛋的连续动作特写，食材飞溅定格，节奏明快，结尾成品摆盘与产品并排展示。9:16 竖屏。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:home-aroma",
    emoji: "🕯️",
    name: "香薰氛围感",
    description: "Luma 暖光烟雾，放松氛围",
    engine: "luma-dream",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "夜晚卧室暖光，香薰 / 蜡烛点燃后烟雾袅袅上升的慢动作特写，光晕柔和，镜头缓推营造放松氛围，结尾产品与氛围光同框。9:16 cinematic。",
    generateScript: false,
    generateCover: true,
  },

  // —— 服饰 / 鞋包 / 饰品 ——
  {
    id: "starter:outfit-switch",
    emoji: "👗",
    name: "穿搭卡点变装",
    description: "原地转身切换多套穿搭",
    engine: "kling-standard",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "同一模特原地转身瞬间切换 3 套穿搭的卡点变装镜头，简约纯色背景，每套定格半秒露出关键单品，结尾全身定妆造型。9:16，时尚硬光。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:shoe-360",
    emoji: "👟",
    name: "鞋类 360 展示",
    description: "图生视频：上传鞋图环绕旋转",
    engine: "kling-i2v",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "运动鞋在简约展台上 360° 旋转，光带扫过鞋面材质与鞋底纹路，镜头环绕突出细节，结尾停在侧面 LOGO。设计取自首帧。9:16。",
    generateScript: false,
    generateCover: false,
  },
  {
    id: "starter:jewelry-shine",
    emoji: "💍",
    name: "饰品光泽特写",
    description: "图生视频：丝绒上转动出火彩",
    engine: "kling-i2v",
    durationSec: 5,
    aspectRatio: "1:1",
    style: "SCENE",
    promptTemplate:
      "饰品在深色丝绒上随光带缓缓转动，宝石折射出闪烁火彩，微距特写表面切割细节，结尾定格正面。所有材质取自首帧。1:1。",
    generateScript: false,
    generateCover: false,
  },

  // —— 食品 / 宠物 / 母婴 / 运动 ——
  {
    id: "starter:snack-asmr",
    emoji: "🍪",
    name: "零食 ASMR 特写",
    description: "掰开拉丝，食欲微距",
    engine: "kling-pro",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "零食被掰开 / 咬下的超近距微距，酥脆碎屑与拉丝细节，暖光突出色泽，糖霜或蒸汽飘落慢动作，结尾包装与产品堆叠展示。9:16，食欲暖色调。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:pet-treat",
    emoji: "🐾",
    name: "宠物零食逗趣",
    description: "Luma 慢镜，馋嘴叼走暖心",
    engine: "luma-dream",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "宠物盯着主人手中零食、耳朵竖起的近景，递出后开心叼走的慢动作，温馨家居暖光，毛发细节清晰，结尾包装特写。9:16 cinematic。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:baby-care",
    emoji: "🍼",
    name: "母婴温馨场景",
    description: "Luma 奶油柔光，安全温柔",
    engine: "luma-dream",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "柔和晨光的婴儿房，妈妈为宝宝使用商品的温柔近景，画面干净安全，浅景深，结尾产品与宝宝同框微笑。9:16，奶油柔光。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:fitness-scene",
    emoji: "🏋️",
    name: "健身器材场景",
    description: "居家训练，动感侧逆光",
    engine: "kling-pro",
    durationSec: 5,
    aspectRatio: "9:16",
    style: "SCENE",
    promptTemplate:
      "居家健身场景，人物使用器材完成一组动作的侧逆光镜头，汗水与肌肉线条特写，动感运镜，结尾产品便携收纳展示。9:16，冷调高对比。",
    generateScript: false,
    generateCover: true,
  },
  {
    id: "starter:review-host",
    emoji: "🗣️",
    name: "测评博主口播",
    description: "MiniMax 海螺，桌前中文测评",
    engine: "minimax-hailuo",
    durationSec: 6,
    aspectRatio: "16:9",
    style: "SCENE",
    promptTemplate:
      "中文测评博主坐在桌前半身镜头，背后简洁书架，手持商品自然讲解卖点与使用感受，结尾比出推荐手势并淡入价格 / 链接。16:9。",
    generateScript: true,
    generateCover: true,
  },
];

export function getStarterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}
