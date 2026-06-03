/**
 * 视频生成引擎目录。
 * 对标 chuhaijiang 的多引擎选择 —— 不同模型有不同的画质 / 时长 / 价格 / 输入要求。
 *
 * fal 模型 ID 可通过 env 覆盖，便于灰度。
 */

export type AspectRatio = "9:16" | "16:9" | "1:1";

export type VideoEngine = {
  /** 内部 key，落到 Video.engine 字段 */
  key: string;
  /** 用户可见名 */
  cn: string;
  /** 一句话定位 */
  tagline: string;
  /** 真实 fal model id */
  falModel: string;
  /** 支持的时长（秒） */
  durations: number[];
  /** 支持的比例 */
  aspects: AspectRatio[];
  /** 是否支持以图为输入（image-to-video） */
  supportsImageInput: boolean;
  /** 单价美分（按所选时长的中位数估算） */
  costCentsBySeconds: (sec: number) => number;
  /** 适用场景 tag */
  tags: string[];
  /** 是否默认推荐 */
  recommended?: boolean;
};

export const VIDEO_ENGINES: VideoEngine[] = [
  {
    key: "kling-standard",
    cn: "Kling 标准",
    tagline: "性价比高，5 秒文生视频首选",
    falModel:
      process.env.FAL_VIDEO_MODEL ?? "fal-ai/kling-video/v1/standard/text-to-video",
    durations: [5],
    aspects: ["9:16", "16:9", "1:1"],
    supportsImageInput: false,
    costCentsBySeconds: (s) => Math.round(s * 1),
    tags: ["便宜", "稳定", "TikTok"],
    recommended: true,
  },
  {
    key: "kling-pro",
    cn: "Kling 专业",
    tagline: "运动幅度大、细节更细腻，适合带货主图",
    falModel: "fal-ai/kling-video/v1.5/pro/text-to-video",
    durations: [5, 10],
    aspects: ["9:16", "16:9", "1:1"],
    supportsImageInput: false,
    costCentsBySeconds: (s) => Math.round(s * 5),
    tags: ["高画质", "运镜复杂"],
  },
  {
    key: "minimax-hailuo",
    cn: "MiniMax 海螺",
    tagline: "中文场景理解强，适合本土化口播",
    falModel: "fal-ai/minimax/video-01",
    durations: [6],
    aspects: ["16:9"],
    supportsImageInput: false,
    costCentsBySeconds: () => 50,
    tags: ["中文", "口播"],
  },
  {
    key: "luma-dream",
    cn: "Luma Dream",
    tagline: "光影丝滑，电影感强，适合品牌叙事",
    falModel: "fal-ai/luma-dream-machine",
    durations: [5],
    aspects: ["9:16", "16:9", "1:1"],
    supportsImageInput: true,
    costCentsBySeconds: () => 35,
    tags: ["电影感", "品牌"],
  },
  {
    key: "kling-i2v",
    cn: "Kling 图生视频",
    tagline: "把商品图当首帧，让产品自己动起来",
    falModel: "fal-ai/kling-video/v1/standard/image-to-video",
    durations: [5],
    aspects: ["9:16", "16:9", "1:1"],
    supportsImageInput: true,
    costCentsBySeconds: () => 8,
    tags: ["图生视频", "需素材"],
  },
];

export function getEngine(key: string): VideoEngine | null {
  return VIDEO_ENGINES.find((e) => e.key === key) ?? null;
}

export function defaultEngine(): VideoEngine {
  return VIDEO_ENGINES.find((e) => e.recommended) ?? VIDEO_ENGINES[0]!;
}
