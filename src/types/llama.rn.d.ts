/**
 * Minimal type declarations for llama.rn
 * Full types are provided by the llama.rn package when installed.
 * This stub enables local TypeScript checking without native dependencies.
 */

declare module 'llama.rn' {
  export interface LlamaContext {
    completion(
      params: {
        messages?: Array<{
          role: 'system' | 'user' | 'assistant';
          content: string;
        }>;
        prompt?: string;
        n_predict?: number;
        temperature?: number;
        stop?: string[];
      },
      onToken?: (data: { token: string }) => void,
    ): Promise<{ text: string; timings?: Record<string, number> }>;

    release(): Promise<void>;
  }

  export interface InitLlamaParams {
    model: string;
    n_ctx?: number;
    n_gpu_layers?: number;
    use_mlock?: boolean;
  }

  export function initLlama(params: InitLlamaParams): Promise<LlamaContext>;

  export function loadLlamaModelInfo(modelPath: string): Promise<Record<string, unknown>>;
}
