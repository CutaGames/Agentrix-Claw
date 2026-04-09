/**
 * Local LLM Sidecar Service — Desktop (Tauri)
 *
 * Manages a llama.cpp server process as a Tauri sidecar for on-device inference.
 * The sidecar runs llama-server (or llama-cli) with a GGUF model file,
 * exposing an OpenAI-compatible API on localhost:8787.
 *
 * Tri-tier role: 端侧 (LOCAL tier) — Gemma Nano 2B or similar small model.
 *
 * Prerequisites:
 *   - llama-server binary bundled as Tauri sidecar (or user-provided path)
 *   - GGUF model file downloaded to app data directory
 *
 * Usage:
 *   const sidecar = new LocalLLMSidecar();
 *   await sidecar.start({ modelPath: '/path/to/gemma-2b.gguf' });
 *   const response = await sidecar.chat([{ role: 'user', content: 'Hello' }]);
 *   await sidecar.stop();
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// ── Types ──────────────────────────────────────────────

export interface SidecarConfig {
  /** Path to GGUF model file */
  modelPath: string;
  /** Port for the local API server (default: 8787) */
  port?: number;
  /** Number of GPU layers to offload (0 = CPU only) */
  nGpuLayers?: number;
  /** Context window size (default: 4096) */
  contextSize?: number;
  /** Number of threads (default: auto) */
  threads?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type SidecarStatus = "stopped" | "starting" | "running" | "error";

export interface LocalModelDownloadEvent {
  modelId: string;
  fileName: string;
  status: "started" | "progress" | "completed" | "error";
  downloadedBytes: number;
  totalBytes?: number;
  progress: number;
  path?: string;
  message?: string;
}

async function localHttpFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await tauriFetch(url, init as any);
  } catch {
    return await fetch(url, init);
  }
}

// ── Service ────────────────────────────────────────────

export class LocalLLMSidecar {
  private status: SidecarStatus = "stopped";
  private port = 8787;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onStatusChange?: (status: SidecarStatus) => void;

  constructor(onStatusChange?: (status: SidecarStatus) => void) {
    this.onStatusChange = onStatusChange;
  }

  /** Start the llama.cpp sidecar server */
  async start(config: SidecarConfig): Promise<void> {
    if (this.status === "running") return;

    this.port = config.port || 8787;
    this.setStatus("starting");

    try {
      // Use Tauri shell plugin to spawn the sidecar process
      await invoke("desktop_bridge_start_llm_sidecar", {
        modelPath: config.modelPath,
        port: this.port,
        nGpuLayers: config.nGpuLayers ?? 0,
        contextSize: config.contextSize ?? 4096,
        threads: config.threads,
      });

      // Wait for server to become healthy
      await this.waitForHealth(45000);
      this.setStatus("running");

      // Start health check polling
      this.healthCheckInterval = setInterval(() => {
        this.checkHealth().catch(() => this.setStatus("error"));
      }, 30000);
    } catch (err) {
      this.setStatus("error");
      throw err;
    }
  }

  /** Stop the sidecar server */
  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      await invoke("desktop_bridge_stop_llm_sidecar");
    } catch {
      // Process may already be dead
    }

    this.setStatus("stopped");
  }

  /** Send a chat completion request to the local model */
  async chat(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: false;
    },
  ): Promise<ChatCompletionResponse> {
    if (this.status !== "running") {
      throw new Error("Local LLM sidecar is not running");
    }

    const response = await localHttpFetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 512,
        reasoning_format: "none",
        chat_template_kwargs: { enable_thinking: false },
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local LLM error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /** Send a streaming chat completion request */
  async *chatStream(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): AsyncGenerator<string> {
    if (this.status !== "running") {
      throw new Error("Local LLM sidecar is not running");
    }

    const response = await localHttpFetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 512,
        reasoning_format: "none",
        chat_template_kwargs: { enable_thinking: false },
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local LLM error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const chunk = JSON.parse(data);
          const content = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.delta?.reasoning_content;
          if (content) yield content;
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  }

  /** Check if the sidecar is healthy */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await Promise.race([
        localHttpFetch(`http://127.0.0.1:${this.port}/health`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Local health check timeout")), 3000)),
      ]);
      return res.ok;
    } catch {
      return false;
    }
  }

  get currentStatus(): SidecarStatus {
    return this.status;
  }

  get isRunning(): boolean {
    return this.status === "running";
  }

  get apiUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  // ── Private ───────────────────────────────────────

  private setStatus(status: SidecarStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private async waitForHealth(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.checkHealth()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Local LLM sidecar did not become healthy within ${timeoutMs}ms`);
  }
}

/**
 * Model Manager — handles downloading and managing GGUF model files.
 */
export class LocalModelManager {
  private modelsDir: string;

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir;
  }

  /** List available local models */
  async listModels(): Promise<Array<{ name: string; path: string; sizeBytes: number }>> {
    try {
      const result = await invoke<Array<{ name: string; path: string; size_bytes: number }>>(
        "desktop_bridge_list_local_models",
        { modelsDir: this.modelsDir },
      );
      return result.map((m) => ({ name: m.name, path: m.path, sizeBytes: m.size_bytes }));
    } catch {
      return [];
    }
  }

  /** Get the default model path (first .gguf file found) */
  async getDefaultModelPath(): Promise<string | null> {
    const models = await this.listModels();
    return models.length > 0 ? models[0].path : null;
  }

  async downloadModel(options: {
    modelId: string;
    url: string;
    fileName: string;
    onProgress?: (event: LocalModelDownloadEvent) => void;
  }): Promise<{ name: string; path: string; sizeBytes: number }> {
    const unlisten = await listen<LocalModelDownloadEvent>("local-model-download", (event) => {
      if (event.payload.modelId === options.modelId) {
        options.onProgress?.(event.payload);
      }
    });

    try {
      const result = await invoke<{ name: string; path: string; size_bytes: number }>(
        "desktop_bridge_download_model",
        {
          modelId: options.modelId,
          url: options.url,
          modelsDir: this.modelsDir,
          fileName: options.fileName,
        },
      );

      return { name: result.name, path: result.path, sizeBytes: result.size_bytes };
    } finally {
      unlisten();
    }
  }
}
