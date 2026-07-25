/**
 * Minimal type declarations for llama.rn
 * Full types are provided by the llama.rn package when installed.
 * This stub enables local TypeScript checking without native dependencies.
 */

declare module 'llama.rn' {
  export type LlamaChatRole = 'system' | 'user' | 'assistant' | 'tool';

  export type LlamaMessageContentPart =
    | {
        type: 'text';
        text: string;
      }
    | {
        type: 'image_url';
        image_url: {
          url: string;
        };
      }
    | {
        type: 'input_audio';
        input_audio: {
          format: string;
          url?: string;
          data?: string;
        };
      };

  export type LlamaMessageContent = string | LlamaMessageContentPart[];

  export interface LlamaMessage {
    role: LlamaChatRole;
    content: LlamaMessageContent;
  }

  export interface ToolFunctionDefinition {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }

  export interface ToolDefinition {
    type: 'function';
    function: ToolFunctionDefinition;
  }

  export interface ToolCallFunction {
    name: string;
    arguments: string;
  }

  export interface ToolCall {
    id?: string;
    type: 'function';
    function: ToolCallFunction;
  }

  export interface CompletionParams {
    messages?: LlamaMessage[];
    prompt?: string;
    n_predict?: number;
    temperature?: number;
    top_p?: number;
    grammar?: string;
    guide_tokens?: number[];
    stop?: string[];
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'none' | 'required';
  }

  export interface CompletionTokenData {
    token?: string | number;
    content?: string;
    reasoning_content?: string;
    accumulated_text?: string;
    tool_calls?: unknown[];
  }

  export interface MultimodalSupport {
    vision: boolean;
    audio: boolean;
  }

  export interface InitMultimodalParams {
    path: string;
    use_gpu?: boolean;
    image_min_tokens?: number;
    image_max_tokens?: number;
  }

  export interface InitVocoderParams {
    path: string;
    n_batch?: number;
  }

  export interface LlamaContext {
    completion(
      params: CompletionParams,
      onToken?: (data: CompletionTokenData) => void,
    ): Promise<{ text: string; tool_calls?: ToolCall[]; audio_tokens?: number[]; timings?: Record<string, number> }>;

    stopCompletion(): Promise<void>;

    initMultimodal(params: InitMultimodalParams): Promise<boolean>;
    isMultimodalEnabled(): Promise<boolean>;
    getMultimodalSupport(): Promise<MultimodalSupport>;
    releaseMultimodal(): Promise<void>;

    initVocoder(params: InitVocoderParams): Promise<boolean>;
    isVocoderEnabled(): Promise<boolean>;
    getFormattedAudioCompletion(
      speaker: object | null,
      textToSpeak: string,
    ): Promise<{ prompt: string; grammar?: string }>;
    getAudioCompletionGuideTokens(textToSpeak: string): Promise<number[]>;
    decodeAudioTokens(tokens: number[]): Promise<number[]>;
    releaseVocoder(): Promise<void>;

    release(): Promise<void>;
  }

  export interface InitLlamaParams {
    model: string;
    n_ctx?: number;
    n_batch?: number;
    n_threads?: number;
    n_gpu_layers?: number;
    use_mlock?: boolean;
    use_mmap?: boolean;
    ctx_shift?: boolean;
    cache_type_k?: string;
    cache_type_v?: string;
  }

  export function initLlama(params: InitLlamaParams): Promise<LlamaContext>;

  export function loadLlamaModelInfo(modelPath: string): Promise<Record<string, unknown>>;
}
