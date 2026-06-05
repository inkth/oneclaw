/**
 * 提示词配方库：把"好镜头"的写法拆成可复用的片段。
 *
 * 思路——一条带货短视频提示词 = 商品主体 + 六个维度的配方拼接：
 *   钩子(hook) → 运镜(shot) → 光线(light) → 节奏(pacing) → 质感(texture) → 收尾(cta)
 *
 * 这些片段都是原创沉淀，可单独在 UI 里做成「配方 chips」让用户点选拼装，
 * 也可作为 LLM 写提示词时的参考词表（喂进 link-parser / director 的 system）。
 */
import type { VideoStyle } from "@prisma/client";

export type RecipeDimension =
  | "hook"
  | "shot"
  | "light"
  | "pacing"
  | "texture"
  | "cta";

export type RecipeFragment = {
  /** 全局唯一 id，dimension 前缀，便于 UI 选中与 LLM 引用 */
  id: string;
  dimension: RecipeDimension;
  /** UI 上的短标签 */
  label: string;
  /** 拼进提示词的片段文案（原创） */
  text: string;
  /** 适配提示，给用户/模型参考 */
  hint?: string;
};

// ——— 开场钩子：前 1-2 秒决定停留 ———
export const HOOK_RECIPES: RecipeFragment[] = [
  {
    id: "hook:detail-first",
    dimension: "hook",
    label: "细节直怼",
    text: "开场半秒直接怼商品最吸睛的细节特写，不留铺垫",
    hint: "质感强的商品（数码/饰品/美妆）",
  },
  {
    id: "hook:problem-first",
    dimension: "hook",
    label: "痛点共鸣",
    text: "开场先用一个痛点画面制造共鸣（杂乱 / 暗沉 / 卡顿 / 难用），再引出商品",
    hint: "解决型商品（收纳/清洁/护肤）",
  },
  {
    id: "hook:motion-in",
    dimension: "hook",
    label: "滑入定格",
    text: "商品从画面外快速滑入并定格，制造动势抓住停留",
  },
  {
    id: "hook:result-tease",
    dimension: "hook",
    label: "结果反差",
    text: "开场先甩出一个反差结果画面（前后对比 / 惊艳成品），让人想看为什么",
    hint: "对比 / Before-After 类",
  },
];

// ——— 运镜：怎么动镜头 ———
export const SHOT_RECIPES: RecipeFragment[] = [
  {
    id: "shot:macro-detail",
    dimension: "shot",
    label: "微距特写",
    text: "微距特写突出材质、纹理与光泽细节",
  },
  {
    id: "shot:orbit",
    dimension: "shot",
    label: "环绕一周",
    text: "镜头绕商品环绕一周，立体展示各个角度",
  },
  {
    id: "shot:push-in",
    dimension: "shot",
    label: "缓推聚焦",
    text: "镜头缓慢推进，逐步聚焦到核心卖点",
  },
  {
    id: "shot:handheld-pov",
    dimension: "shot",
    label: "第一视角",
    text: "第一人称手持视角，模拟真实上手使用的过程",
  },
  {
    id: "shot:split-screen",
    dimension: "shot",
    label: "分屏对比",
    text: "左右分屏同框对比，差异一眼可见",
  },
  {
    id: "shot:top-down",
    dimension: "shot",
    label: "正俯拍",
    text: "正俯拍展示全貌与布局，干净有秩序",
  },
];

// ——— 光线 / 色调：定氛围 ———
export const LIGHT_RECIPES: RecipeFragment[] = [
  {
    id: "light:soft-warm",
    dimension: "light",
    label: "暖光奶油",
    text: "柔和暖光、奶油色调，高级而温馨",
    hint: "美妆/母婴/家居",
  },
  {
    id: "light:cool-tech",
    dimension: "light",
    label: "冷调科技",
    text: "冷色科技光、高对比，干净利落",
    hint: "3C/数码/家电",
  },
  {
    id: "light:golden-hour",
    dimension: "light",
    label: "黄金时刻",
    text: "黄金时刻暖橘自然光，电影氛围感",
  },
  {
    id: "light:studio-hard",
    dimension: "light",
    label: "影棚硬光",
    text: "影棚硬光，强光影立体感，突出质感轮廓",
  },
  {
    id: "light:bright-natural",
    dimension: "light",
    label: "明亮自然",
    text: "明亮自然光，真实通透，贴近日常场景",
    hint: "厨房/食品/日用",
  },
];

// ——— 节奏 / 剪辑 ———
export const PACING_RECIPES: RecipeFragment[] = [
  {
    id: "pacing:fast-cut",
    dimension: "pacing",
    label: "快卡点",
    text: "快节奏卡点剪辑，每 0.5-1 秒切换一次，信息密度高",
  },
  {
    id: "pacing:slow-mo",
    dimension: "pacing",
    label: "慢动作",
    text: "关键瞬间用慢动作放大细节与情绪",
  },
  {
    id: "pacing:one-take",
    dimension: "pacing",
    label: "一镜到底",
    text: "一镜到底流畅运镜，沉浸不跳脱",
  },
  {
    id: "pacing:beat-freeze",
    dimension: "pacing",
    label: "定格弹字",
    text: "动作到位即定格，同时弹出卖点字幕",
  },
];

// ——— 画面质感 ———
export const TEXTURE_RECIPES: RecipeFragment[] = [
  {
    id: "texture:shallow-dof",
    dimension: "texture",
    label: "浅景深",
    text: "浅景深，背景虚化突出主体",
  },
  {
    id: "texture:cinematic",
    dimension: "texture",
    label: "电影感",
    text: "电影感调色，细腻光晕",
  },
  {
    id: "texture:clean-ecom",
    dimension: "texture",
    label: "干净电商",
    text: "干净电商质感，纯色背景、无杂物",
  },
];

// ——— 收尾 CTA ———
export const CTA_RECIPES: RecipeFragment[] = [
  {
    id: "cta:logo-freeze",
    dimension: "cta",
    label: "LOGO 定格",
    text: "结尾定格商品正面 LOGO 特写",
  },
  {
    id: "cta:price-fade",
    dimension: "cta",
    label: "淡入价格",
    text: "结尾淡入价格 / 链接 / 优惠信息",
  },
  {
    id: "cta:lineup",
    dimension: "cta",
    label: "排列展示",
    text: "结尾多 SKU / 色号排列展示，凸显丰富选择",
  },
  {
    id: "cta:gesture",
    dimension: "cta",
    label: "推荐手势",
    text: "出镜人比出推荐手势收尾，强化信任",
    hint: "数字人 / 口播类",
  },
];

/** 全部片段汇总，按维度归组，方便 UI 渲染 */
export const RECIPE_GROUPS: Record<RecipeDimension, RecipeFragment[]> = {
  hook: HOOK_RECIPES,
  shot: SHOT_RECIPES,
  light: LIGHT_RECIPES,
  pacing: PACING_RECIPES,
  texture: TEXTURE_RECIPES,
  cta: CTA_RECIPES,
};

const ALL_FRAGMENTS: RecipeFragment[] = [
  ...HOOK_RECIPES,
  ...SHOT_RECIPES,
  ...LIGHT_RECIPES,
  ...PACING_RECIPES,
  ...TEXTURE_RECIPES,
  ...CTA_RECIPES,
];

const FRAGMENT_BY_ID = new Map(ALL_FRAGMENTS.map((f) => [f.id, f]));

export function getFragment(id: string): RecipeFragment | undefined {
  return FRAGMENT_BY_ID.get(id);
}

/** 每种风格的推荐配方预设（id 引用），是模板之外更细粒度的"半成品" */
export const STYLE_PRESETS: Record<
  VideoStyle,
  { hook: string; shots: string[]; light: string; pacing: string; texture: string; cta: string }
> = {
  UNBOXING: {
    hook: "hook:detail-first",
    shots: ["shot:handheld-pov", "shot:macro-detail"],
    light: "light:studio-hard",
    pacing: "pacing:beat-freeze",
    texture: "texture:shallow-dof",
    cta: "cta:logo-freeze",
  },
  COMPARISON: {
    hook: "hook:result-tease",
    shots: ["shot:split-screen"],
    light: "light:cool-tech",
    pacing: "pacing:fast-cut",
    texture: "texture:clean-ecom",
    cta: "cta:price-fade",
  },
  SCENE: {
    hook: "hook:motion-in",
    shots: ["shot:push-in", "shot:macro-detail"],
    light: "light:golden-hour",
    pacing: "pacing:slow-mo",
    texture: "texture:cinematic",
    cta: "cta:logo-freeze",
  },
  BEFORE_AFTER: {
    hook: "hook:problem-first",
    shots: ["shot:split-screen", "shot:push-in"],
    light: "light:soft-warm",
    pacing: "pacing:beat-freeze",
    texture: "texture:shallow-dof",
    cta: "cta:price-fade",
  },
};

const ASPECT_CN: Record<string, string> = {
  "9:16": "9:16 竖屏",
  "16:9": "16:9 横屏",
  "1:1": "1:1 方形",
};

/**
 * 把「商品主体 + 选定配方片段」拼成一条自然的中文提示词。
 * 各维度传"片段文案"（不是 id），便于直接复用 STYLE_PRESETS 解析后的结果或自由文本。
 */
export function composePrompt(input: {
  subject: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  hook?: string;
  shots?: string[];
  light?: string;
  pacing?: string;
  texture?: string;
  cta?: string;
}): string {
  const parts: string[] = [];
  const subject = input.subject.trim().replace(/[。.，,；;\s]+$/, "");
  if (subject) parts.push(subject);
  if (input.hook) parts.push(input.hook);
  if (input.shots?.length) parts.push(input.shots.filter(Boolean).join("、"));
  if (input.light) parts.push(input.light);
  if (input.pacing) parts.push(input.pacing);
  if (input.texture) parts.push(input.texture);
  if (input.cta) parts.push(input.cta);

  let prompt = parts.join("；") + "。";
  if (input.aspectRatio) prompt += `${ASPECT_CN[input.aspectRatio] ?? input.aspectRatio}。`;
  return prompt;
}

/** 取某风格的预设并解析成可读文案，直接喂给 composePrompt */
export function presetTextsForStyle(style: VideoStyle) {
  const p = STYLE_PRESETS[style];
  const txt = (id: string) => getFragment(id)?.text ?? "";
  return {
    hook: txt(p.hook),
    shots: p.shots.map(txt).filter(Boolean),
    light: txt(p.light),
    pacing: txt(p.pacing),
    texture: txt(p.texture),
    cta: txt(p.cta),
  };
}

/**
 * 一步到位：给商品描述 + 风格 + 比例，按该风格预设生成一条提示词。
 * link-parser / director 可用它兜底，或作为用户点「智能配方」的默认产出。
 */
export function composeFromStyle(input: {
  subject: string;
  style: VideoStyle;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}): string {
  return composePrompt({
    subject: input.subject,
    aspectRatio: input.aspectRatio ?? "9:16",
    ...presetTextsForStyle(input.style),
  });
}
