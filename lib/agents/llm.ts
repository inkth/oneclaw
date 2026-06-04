import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { getOpenRouter, DEFAULT_MODEL, estimateCostCents } from "@/lib/openrouter";

export type LLMUsage = {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
};

export type LLMResult<T = string> = {
  content: T;
  usage: LLMUsage;
};

// 已知的推理模型（reasoning）——这类模型会先消耗一半以上 token 做思维链，
// 必须给足 max_tokens，否则 content 会是 null 且 finish_reason=length。
const REASONING_MODELS = new Set([
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-r1",
  "openai/o1",
  "openai/o3-mini",
  "openai/o4-mini",
]);

function isReasoning(model: string): boolean {
  if (REASONING_MODELS.has(model)) return true;
  return /(\bo1\b|\bo3\b|\bo4\b|-reasoning|-r1|v4-pro)/i.test(model);
}

export async function chat(opts: {
  system: string;
  user: string;
  model?: string;
  json?: boolean;
  maxTokens?: number;
}): Promise<LLMResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const reasoning = isReasoning(model);

  // reasoning 模型：用户传的 budget × 3 留给思维链
  const requested = opts.maxTokens ?? 2000;
  const maxTokens = reasoning ? Math.max(requested * 3, 6000) : requested;

  const body: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: maxTokens,
    temperature: reasoning ? 1 : 0.7, // reasoning 模型不接受低 temperature
    stream: false,
  };

  // JSON mode：reasoning 模型通常不支持 response_format，强 prompt 即可
  if (opts.json && !reasoning) {
    body.response_format = { type: "json_object" };
  }

  const res = (await getOpenRouter().chat.completions.create(body)) as ChatCompletion;

  const choice = res.choices[0];
  let content = choice?.message?.content ?? "";

  // 兜底：如果 content 空但有 reasoning_details（DeepSeek/o1 风格），抽其中的文本
  if (!content && choice?.message) {
    const msg = choice.message as unknown as {
      reasoning_details?: Array<{ text?: string }>;
    };
    if (Array.isArray(msg.reasoning_details)) {
      content = msg.reasoning_details
        .map((r) => r.text ?? "")
        .filter(Boolean)
        .join("\n");
    }
  }

  if (!content) {
    throw new Error(
      `LLM 返回空内容（finish_reason=${choice?.finish_reason ?? "?"}）。` +
        `若是 reasoning 模型，请提升 max_tokens 或换非 reasoning 模型。`,
    );
  }

  const tokensIn = res.usage?.prompt_tokens ?? 0;
  const tokensOut = res.usage?.completion_tokens ?? 0;

  return {
    content,
    usage: {
      model,
      tokensIn,
      tokensOut,
      costCents: estimateCostCents(model, tokensIn, tokensOut),
    },
  };
}

/**
 * 流式对话——用于全局 AI Copilot 等需要逐字返回的场景。
 * 复用 OpenRouter（OpenAI SDK）的 stream 能力，返回纯文本 token 的 ReadableStream，
 * 客户端只需追加字符串即可。注意：流式不做成本落库（无最终 usage），
 * 仅用于轻量助手对话，不计入 Agent 任务配额。
 */
export async function chatStream(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  model?: string;
  maxTokens?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const model = opts.model ?? DEFAULT_MODEL;
  const stream = await getOpenRouter().chat.completions.create({
    model,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages,
    ],
    max_tokens: opts.maxTokens ?? 1500,
    temperature: 0.7,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) controller.enqueue(encoder.encode(token));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * 当 LLM 输出在 ```json ... ``` 块里 / 前后有解释文字 / 思维链中混合时，尽可能抽出 JSON。
 */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // 找最外层 {} 或 []
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1)) as T;
    }
    const firstA = candidate.indexOf("[");
    const lastA = candidate.lastIndexOf("]");
    if (firstA >= 0 && lastA > firstA) {
      return JSON.parse(candidate.slice(firstA, lastA + 1)) as T;
    }
    throw new Error("LLM 返回的不是合法 JSON");
  }
}
