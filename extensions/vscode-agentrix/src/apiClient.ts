/**
 * Thin Agentrix backend client for the VS Code extension.
 *
 * Why this is so small:
 *   - Backend already speaks JWT + REST (same paths the desktop app uses)
 *   - The extension forwards what's in the IDE chat to the same `/api/claude/chat`
 *     and `/api/agent-tasks` that desktop uses. Per AGENTS.md hard rule 2,
 *     these two chat paths must stay in sync; any new envelope lands in both.
 *
 * Auth: PAT only in v0.1. Device-code OAuth is a v0.2 follow-up.
 */

import * as vscode from "vscode";
import {
  IDE_BRIDGE_BACKEND_PATHS,
  IDE_BRIDGE_PROTOCOL_VERSION,
  type IdeBridgeHandshakeRequest,
  type IdeBridgeHandshakeResponse,
} from "../../../shared/types/ide-bridge";

const SECRET_KEY_PAT = "agentrix.pat";

interface ClientOptions {
  apiBase: () => string;
  secrets: vscode.SecretStorage;
  log: vscode.OutputChannel;
}

export interface AgentTaskRecord {
  id: string;
  title: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progress?: number;
  resultSummary?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface MemorySlot {
  key: string;
  scope: string;
  summary?: string;
  value?: unknown;
  importance?: number;
}

export class AgentrixApiClient {
  constructor(private readonly opts: ClientOptions) {}

  // ── Auth ────────────────────────────────────────────────────────────

  async getToken(): Promise<string | null> {
    return (await this.opts.secrets.get(SECRET_KEY_PAT)) ?? null;
  }

  async hasToken(): Promise<boolean> {
    return Boolean(await this.getToken());
  }

  async signInWithPat(): Promise<boolean> {
    const pat = await vscode.window.showInputBox({
      prompt: "Agentrix Personal Access Token",
      placeHolder: "Paste your token from agentrix.top/account/tokens",
      password: true,
      ignoreFocusOut: true,
    });
    if (!pat) return false;
    await this.opts.secrets.store(SECRET_KEY_PAT, pat.trim());
    // Validate by handshaking.
    const handshake = await this.handshake();
    if (!handshake.ok) {
      await this.opts.secrets.delete(SECRET_KEY_PAT);
      throw new Error(handshake.error || "handshake failed");
    }
    return true;
  }

  async signOut(): Promise<void> {
    await this.opts.secrets.delete(SECRET_KEY_PAT);
  }

  // ── Handshake ───────────────────────────────────────────────────────

  async handshake(): Promise<IdeBridgeHandshakeResponse> {
    const ideTarget = this.detectIdeTarget();
    const body: IdeBridgeHandshakeRequest = {
      protocolVersion: IDE_BRIDGE_PROTOCOL_VERSION,
      extensionVersion: this.extensionVersion(),
      ideTarget,
      surface: "sidebar-view",
      locale: vscode.env.language,
      preferredMode: this.preferredMode(),
    };
    try {
      const res = await this.fetchAuthed(IDE_BRIDGE_BACKEND_PATHS.handshake, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return {
          ok: false,
          protocolVersion: IDE_BRIDGE_PROTOCOL_VERSION,
          user: { id: "" },
          capabilities: [],
          error: `HTTP ${res.status}`,
        };
      }
      return (await res.json()) as IdeBridgeHandshakeResponse;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        protocolVersion: IDE_BRIDGE_PROTOCOL_VERSION,
        user: { id: "" },
        capabilities: [],
        error: msg,
      };
    }
  }

  // ── Chat (mirrors /api/claude/chat) ─────────────────────────────────

  async sendChat(
    sessionId: string,
    message: string,
    onEvent: (line: string) => void,
  ): Promise<void> {
    const res = await this.fetchAuthed(
      IDE_BRIDGE_BACKEND_PATHS.claudeChatMirror,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      },
    );
    if (!res.ok || !res.body) {
      throw new Error(`chat HTTP ${res.status}`);
    }
    // Minimal SSE / NDJSON reader. Backend sends newline-separated JSON.
    const reader = (res.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) onEvent(line);
      }
    }
    if (buffer.trim()) onEvent(buffer.trim());
  }

  // ── Agent tasks ─────────────────────────────────────────────────────

  async createAgentTask(payload: {
    title: string;
    prompt: string;
  }): Promise<AgentTaskRecord> {
    const res = await this.fetchAuthed(
      IDE_BRIDGE_BACKEND_PATHS.agentTaskCreate,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw new Error(`createAgentTask HTTP ${res.status}`);
    return (await res.json()) as AgentTaskRecord;
  }

  async listAgentTasks(): Promise<AgentTaskRecord[]> {
    const res = await this.fetchAuthed(IDE_BRIDGE_BACKEND_PATHS.agentTaskList);
    if (!res.ok) throw new Error(`listAgentTasks HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data as AgentTaskRecord[];
    if (Array.isArray((data as any).items)) {
      return (data as any).items as AgentTaskRecord[];
    }
    return [];
  }

  // ── Memory recall ───────────────────────────────────────────────────

  async recallMemory(params: { limit?: number }): Promise<MemorySlot[]> {
    const res = await this.fetchAuthed(
      IDE_BRIDGE_BACKEND_PATHS.memoryRecall,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: params.limit ?? 20 }),
      },
    );
    if (!res.ok) throw new Error(`recall HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data as MemorySlot[];
    if (Array.isArray((data as any).slots)) return (data as any).slots as MemorySlot[];
    return [];
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private async fetchAuthed(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getToken();
    const headers = new Headers(init.headers ?? {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const url = `${this.opts.apiBase()}${path}`;
    this.opts.log.appendLine(`[api] ${init.method ?? "GET"} ${url}`);
    return globalThis.fetch(url, { ...init, headers });
  }

  private detectIdeTarget(): IdeBridgeHandshakeRequest["ideTarget"] {
    const appName = vscode.env.appName.toLowerCase();
    if (appName.includes("cursor")) return "cursor";
    if (appName.includes("windsurf")) return "windsurf";
    return "vscode";
  }

  private extensionVersion(): string {
    // Webpack/tsc don't bake version into the bundle; vsce sets it
    // when packaging. Fallback to "dev" during local hacking.
    return process.env.AGENTRIX_EXT_VERSION ?? "0.1.0";
  }

  private preferredMode(): "simple" | "standard" | "pro" {
    const value = vscode.workspace.getConfiguration("agentrix").get<string>("preferredMode");
    if (value === "simple" || value === "standard" || value === "pro") return value;
    return "pro";
  }
}
