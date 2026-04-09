import { NativeModules } from 'react-native';

export type MobileLocalChatRole = 'system' | 'user' | 'assistant';

export interface MobileLocalChatMessage {
  role: MobileLocalChatRole;
  content: string;
}

type LocalBridgeGenerateResult =
  | string
  | {
      text?: string;
      content?: string;
      reply?: string;
    };

type LocalBridge = {
  isAvailable?: () => boolean | Promise<boolean>;
  generate?: (payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }) => Promise<LocalBridgeGenerateResult>;
  generateStream?: (payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }) => Promise<string[] | LocalBridgeGenerateResult>;
};

const DEFAULT_MODEL_ID = 'gemma-4-2b';
const DEFAULT_MODEL_LABEL = 'Gemma 4 2B (Local)';

function resolveBridge(): LocalBridge | null {
  const nativeBridge = (NativeModules as Record<string, unknown>)?.AgentrixLocalLLM as LocalBridge | undefined;
  if (nativeBridge) {
    return nativeBridge;
  }

  const globalBridge = (globalThis as { __AGENTRIX_LOCAL_LLM__?: LocalBridge }).__AGENTRIX_LOCAL_LLM__;
  return globalBridge || null;
}

function extractText(result: LocalBridgeGenerateResult | null | undefined): string {
  if (!result) {
    return '';
  }

  if (typeof result === 'string') {
    return result;
  }

  return String(result.text || result.content || result.reply || '');
}

function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const sentenceMatches = trimmed.match(/[^。！？.!?\n]+[。！？.!?\n]*/g);
  if (sentenceMatches?.length) {
    return sentenceMatches.map((item) => item.trim()).filter(Boolean);
  }

  return trimmed.match(/.{1,48}(?:\s+|$)/g)?.map((item) => item.trim()).filter(Boolean) || [trimmed];
}

function normalizeLocalOutput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  const withoutThinkTags = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!/^Thinking Process:/i.test(withoutThinkTags)) {
    return withoutThinkTags;
  }

  const parts = withoutThinkTags.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const tail = parts[parts.length - 1];
    if (tail && !/^Thinking Process:/i.test(tail)) {
      return tail;
    }
  }

  return withoutThinkTags;
}

export class MobileLocalInferenceService {
  static readonly modelId = DEFAULT_MODEL_ID;
  static readonly modelLabel = DEFAULT_MODEL_LABEL;

  static async isAvailable(): Promise<boolean> {
    const bridge = resolveBridge();
    if (!bridge) {
      return false;
    }

    if (typeof bridge.isAvailable === 'function') {
      try {
        return await bridge.isAvailable();
      } catch {
        return false;
      }
    }

    return typeof bridge.generate === 'function' || typeof bridge.generateStream === 'function';
  }

  static async generate(messages: MobileLocalChatMessage[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<string> {
    const bridge = resolveBridge();
    if (!bridge) {
      throw new Error('Local mobile inference bridge is not available on this device.');
    }

    if (typeof bridge.generate === 'function') {
      const result = await bridge.generate({
        model: options?.model || DEFAULT_MODEL_ID,
        messages,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
      return normalizeLocalOutput(extractText(result));
    }

    if (typeof bridge.generateStream === 'function') {
      const streamed = await bridge.generateStream({
        model: options?.model || DEFAULT_MODEL_ID,
        messages,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      if (Array.isArray(streamed)) {
        return normalizeLocalOutput(streamed.join(''));
      }

      return normalizeLocalOutput(extractText(streamed));
    }

    throw new Error('Local mobile inference bridge does not implement a generate API.');
  }

  static async *generateTextStream(
    messages: MobileLocalChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<string> {
    const bridge = resolveBridge();
    if (!bridge) {
      throw new Error('Local mobile inference bridge is not available on this device.');
    }

    if (typeof bridge.generateStream === 'function') {
      const streamed = await bridge.generateStream({
        model: options?.model || DEFAULT_MODEL_ID,
        messages,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      if (Array.isArray(streamed)) {
        const normalized = normalizeLocalOutput(streamed.join(''));
        for (const chunk of chunkText(normalized)) {
          yield chunk;
        }
        return;
      }

      const text = normalizeLocalOutput(extractText(streamed));
      for (const chunk of chunkText(text)) {
        yield chunk;
      }
      return;
    }

    const text = normalizeLocalOutput(await this.generate(messages, options));
    for (const chunk of chunkText(text)) {
      yield chunk;
    }
  }
}