/**
 * Provider-agnostic AI abstraction (server-only).
 *
 * All AI API routes import `provider` from here — never a concrete client
 * directly. This is the seam for swapping the LLM (DeepSeek today; could be
 * Claude / 通义 / Kimi later) without touching call sites. Selection is driven
 * by AI_PROVIDER (defaults to 'deepseek').
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Request a JSON object response (response_format json_object). */
  jsonMode?: boolean;
}

export interface AIProvider {
  /** Non-streaming completion — returns the full message text. */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  /** Streaming completion — UTF-8 text tokens (assistant deltas only). */
  chatStream(messages: ChatMessage[], opts?: ChatOptions): Promise<ReadableStream<Uint8Array>>;
}

import { deepseek } from './deepseek';

const PROVIDERS: Record<string, AIProvider> = {
  deepseek,
};

const name = process.env.AI_PROVIDER ?? 'deepseek';

export const provider: AIProvider = PROVIDERS[name] ?? deepseek;
