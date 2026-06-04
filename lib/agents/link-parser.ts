/**
 * 贴商品链接 → 自动出片：解析任意商品页，抽取商品信息并给出创作建议。
 *
 * 流程：fetch 商品页 HTML → 粗清洗成纯文本 + 抓 og:image → 丢给 LLM 抽成结构化 JSON
 *（商品标题 / 卖点 / 适配风格 / 引擎 / 提示词）。这一步只读外部公开页面，不落库；
 * 调用方拿到结果后预填创作向导，由用户确认再生成视频。
 */
import { z } from "zod";
import { chat, extractJson } from "@/lib/agents/llm";
import { VIDEO_ENGINES } from "@/lib/video-engines";

const ENGINE_KEYS = VIDEO_ENGINES.map((e) => e.key);
const STYLES = ["UNBOXING", "COMPARISON", "SCENE", "BEFORE_AFTER"] as const;

export type ParsedLink = z.infer<typeof parsedSchema>;

const parsedSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.string().max(60).default("未分类"),
  emoji: z.string().max(8).default("📦"),
  sellingPoints: z.array(z.string().max(80)).max(6).default([]),
  /** 给创作向导预填的字段 */
  suggestedStyle: z.enum(STYLES).default("SCENE"),
  suggestedEngine: z.string().default("kling-standard"),
  suggestedPrompt: z.string().min(10).max(2000),
  videoTitle: z.string().max(120).default(""),
});

const SYSTEM = `你是带货短视频的创意策划。用户会给你一个商品落地页抓下来的纯文本，
请判断这是什么商品，并给出一条可直接用于 AI 文生视频的中文提示词。

只输出一个 JSON 对象，字段：
- title: 商品名（简洁，去掉店铺名/促销词）
- category: 品类（如 3C数码 / 美妆 / 家居 / 宠物 / 服饰）
- emoji: 一个最贴切的 emoji
- sellingPoints: 3-5 条核心卖点，每条不超过 20 字
- suggestedStyle: 从 [UNBOXING, COMPARISON, SCENE, BEFORE_AFTER] 选最适合该商品的一种
- suggestedEngine: 从给定引擎 key 里选一个（默认 kling-standard）
- suggestedPrompt: 一条 9:16 竖屏带货视频提示词，描述画面/镜头/光线/卖点呈现，60-200 字
- videoTitle: 一个适合发 TikTok 的短标题（带 1-2 个 emoji）

不要输出任何解释文字，只要 JSON。`;

/** 抓商品页，超时 10s，伪装成浏览器 UA。失败抛错。 */
async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`商品页返回 ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 从 HTML 抠出 og:image（视频封面候选）。 */
function extractOgImage(html: string): string | null {
  const m =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    );
  return m?.[1] ?? null;
}

/** 把 HTML 粗清洗成纯文本，截断到 ~6000 字喂模型。 */
function htmlToText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const desc =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ?? "";
  const ogTitle =
    html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ?? "";

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    `PAGE_TITLE: ${title}`,
    ogTitle && `OG_TITLE: ${ogTitle}`,
    desc && `DESCRIPTION: ${desc}`,
    `BODY: ${body}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
}

export type LinkParseResult = {
  parsed: ParsedLink;
  ogImage: string | null;
  usage: { tokensIn: number; tokensOut: number; costCents: number };
};

export async function parseProductLink(url: string): Promise<LinkParseResult> {
  const html = await fetchPage(url);
  const text = htmlToText(html);
  const ogImage = extractOgImage(html);

  if (text.replace(/PAGE_TITLE:|OG_TITLE:|DESCRIPTION:|BODY:/g, "").trim().length < 40) {
    throw new Error("这个页面抓不到有效内容，可能需要登录或是纯前端渲染。换个链接或手动填。");
  }

  const { content, usage } = await chat({
    system: SYSTEM,
    user: `引擎 key 可选：${ENGINE_KEYS.join(", ")}\n\n商品页内容：\n${text}`,
    json: true,
    maxTokens: 900,
  });

  const raw = extractJson(content);
  const parsed = parsedSchema.parse(raw);

  // 防幻觉：引擎 key 不在白名单就回落到推荐引擎
  if (!ENGINE_KEYS.includes(parsed.suggestedEngine)) {
    parsed.suggestedEngine = "kling-standard";
  }

  return {
    parsed,
    ogImage,
    usage: {
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costCents: usage.costCents,
    },
  };
}
