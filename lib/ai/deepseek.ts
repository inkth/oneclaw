/**
 * DeepSeek chat client (server-only).
 *
 * - OpenAI-compatible Chat Completions API at https://api.deepseek.com.
 * - Bearer auth via DEEPSEEK_API_KEY. Model via DEEPSEEK_MODEL (default
 *   deepseek-chat). Base URL override via DEEPSEEK_BASE_URL.
 * - `chat()` is non-streaming and returns the full message text.
 * - `chatStream()` returns a ReadableStream of plain UTF-8 text tokens
 *   (the assistant deltas only) so a client can append chunks directly.
 *
 * 🚫 Do NOT import this from a Client Component — it reads server-only env.
 *    Route handlers and server components only.
 */

import type { AIProvider, ChatMessage, ChatOptions } from './provider';

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

export class AIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(`[DeepSeek ${status}] ${message}`);
    this.name = 'AIError';
  }
}

function authHeader(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error(
      'DeepSeek credentials missing. Set DEEPSEEK_API_KEY in .env.local',
    );
  }
  return `Bearer ${key}`;
}

function body(messages: ChatMessage[], opts: ChatOptions, stream: boolean) {
  return JSON.stringify({
    model: MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
    response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
    stream,
  });
}

interface CompletionResponse {
  choices: { message: { content: string } }[];
}

async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body(messages, opts, false),
  });

  if (!res.ok) {
    throw new AIError(await res.text().catch(() => `HTTP ${res.status}`), res.status);
  }

  const data = (await res.json()) as CompletionResponse;
  return data.choices[0]?.message?.content ?? '';
}

async function chatStream(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body(messages, opts, true),
  });

  if (!res.ok || !res.body) {
    throw new AIError(await res.text().catch(() => `HTTP ${res.status}`), res.status);
  }

  // Transform DeepSeek's SSE stream (data: {json}\n\n ... data: [DONE]) into a
  // plain text stream of the assistant's content deltas.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '' || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const token = json.choices?.[0]?.delta?.content;
          if (token) controller.enqueue(encoder.encode(token));
        } catch {
          // Ignore malformed/partial SSE chunks; the next pull may complete them.
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

export const deepseek: AIProvider = { chat, chatStream };
