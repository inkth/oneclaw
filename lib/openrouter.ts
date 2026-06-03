import OpenAI from "openai";

/**
 * OpenRouter 客户端：复用 OpenAI SDK，把 baseURL 改成 openrouter。
 * 默认模型可由 OPENROUTER_MODEL 覆盖。
 *
 * 注意：OpenAI SDK 在构造时会校验 apiKey，空字符串会立即抛错。
 * 用 lazy 单例避免「未配置 key 时连模块都导入不进来」。
 */
let _client: OpenAI | null = null;

export function getOpenRouter(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY 未配置：去 https://openrouter.ai 申请一个 key 并填到 .env.local",
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.AUTH_URL ?? "https://oneclaw.ai",
      "X-Title": "OneClaw",
    },
  });
  return _client;
}

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

export function isOpenRouterConfigured() {
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * 价格表（per 1M tokens, USD）—— 用来粗略算成本，落库到 AgentTask.costCents
 */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4.5": { input: 3, output: 15 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5 },
  "anthropic/claude-opus-4.5": { input: 15, output: 75 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10 },
  "deepseek/deepseek-v4-pro": { input: 0.55, output: 2.2 },
  "deepseek/deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek/deepseek-r1": { input: 0.55, output: 2.2 },
};

export function estimateCostCents(
  model: string,
  tokensIn: number,
  tokensOut: number,
) {
  const p = PRICE_TABLE[model] ?? PRICE_TABLE["anthropic/claude-sonnet-4.5"];
  const usd = (tokensIn / 1_000_000) * p.input + (tokensOut / 1_000_000) * p.output;
  return Math.round(usd * 100);
}
