/**
 * 视频生成引擎目录。
 * 现已统一走 OpenRouter 视频接口（POST /api/v1/videos），复用 OPENROUTER_API_KEY。
 * model 为 OpenRouter 模型 slug，可通过 OPENROUTER_VIDEO_MODEL env 覆盖默认引擎，便于灰度。
 */

export type AspectRatio = "9:16" | "16:9" | "1:1";

export type VideoProvider = "openrouter" | "fal";

export type VideoEngine = {
  /** 内部 key，落到 Video.engine 字段 */
  key: string;
  /** 用户可见名 */
  cn: string;
  /** 一句话定位 */
  tagline: string;
  /** 生成后端 */
  provider: VideoProvider;
  /** provider 侧模型 slug（openrouter 如 bytedance/seedance-2.0-fast；落到 Video.falModel 字段） */
  model: string;
  /** 支持的时长（秒） */
  durations: number[];
  /** 支持的比例 */
  aspects: AspectRatio[];
  /** 是否支持以图为输入（image-to-video） */
  supportsImageInput: boolean;
  /** 是否必须传图（强制 i2v） */
  requiresImage?: boolean;
  /** 单价美分（按所选时长的中位数估算） */
  costCentsBySeconds: (sec: number) => number;
  /** 适用场景 tag */
  tags: string[];
  /** 是否默认推荐 */
  recommended?: boolean;
};

export const VIDEO_ENGINES: VideoEngine[] = [
  {
    key: "seedance-fast",
    cn: "Seedance 2.0 Fast",
    tagline: "字节 Seedance，快又便宜，文生 / 图生视频通吃",
    provider: "openrouter",
    model: process.env.OPENROUTER_VIDEO_MODEL ?? "bytedance/seedance-2.0-fast",
    durations: [5],
    aspects: ["9:16", "16:9", "1:1"],
    supportsImageInput: true,
    costCentsBySeconds: (s) => Math.round(s * 2),
    tags: ["快", "便宜", "文+图"],
    recommended: true,
  },
];

export function getEngine(key: string): VideoEngine | null {
  return VIDEO_ENGINES.find((e) => e.key === key) ?? null;
}

export function defaultEngine(): VideoEngine {
  return VIDEO_ENGINES.find((e) => e.recommended) ?? VIDEO_ENGINES[0]!;
}
