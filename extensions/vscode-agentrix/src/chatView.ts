/**
 * Webview chat view registered under the Agentrix activity-bar.
 *
 * Minimal v0.1: an HTML form with input + message log. Calls
 * `client.sendChat(sessionId, message, onEvent)` to forward to the
 * existing Agentrix backend chat path.
 *
 * Intentionally simple — we are NOT trying to compete with Cursor's
 * polished chat UX. We exist to expose Agentrix's cross-tool memory +
 * long-task + cross-device features inside the IDE.
 */

import * as vscode from "vscode";
import type { AgentrixApiClient } from "./apiClient";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private sessionId = `vscode-${Date.now().toString(36)}`;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: AgentrixApiClient,
    private readonly log: vscode.OutputChannel,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.renderHtml();
    view.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.appendLine(`[chatView] handleMessage error: ${msg}`);
        this.post({ kind: "error", text: msg });
      });
    });
    void this.refreshHandshake();
  }

  async refreshHandshake(): Promise<void> {
    if (!this.view) return;
    if (!(await this.client.hasToken())) {
      this.post({
        kind: "system",
        text: "Sign in via 'Agentrix: Sign In' to start chatting. Your VS Code chat will then forward to api.agentrix.top.",
      });
      return;
    }
    const handshake = await this.client.handshake();
    if (handshake.ok) {
      this.post({
        kind: "system",
        text: `Connected as ${handshake.user.displayName || handshake.user.id}. Capabilities: ${handshake.capabilities.join(", ")}`,
      });
    } else {
      this.post({
        kind: "system",
        text: `Handshake failed: ${handshake.error || "unknown error"}`,
      });
    }
  }

  private async handleMessage(message: { type: string; text?: string }): Promise<void> {
    if (message.type !== "send" || !message.text) return;
    if (!(await this.client.hasToken())) {
      this.post({ kind: "error", text: "Not signed in. Run 'Agentrix: Sign In'." });
      return;
    }
    this.post({ kind: "user", text: message.text });
    try {
      let acc = "";
      await this.client.sendChat(this.sessionId, message.text, (line) => {
        // Backend sends newline-separated JSON envelopes. Try to parse;
        // unparsable lines are forwarded as raw debug.
        try {
          const evt = JSON.parse(line);
          if (evt && typeof evt === "object" && evt.type === "delta" && typeof evt.text === "string") {
            acc += evt.text;
            this.post({ kind: "assistant-stream", text: acc });
          } else if (evt?.type === "done") {
            this.post({ kind: "assistant-final", text: acc });
            acc = "";
          } else if (evt?.type === "error") {
            this.post({ kind: "error", text: String(evt.message || "error") });
          }
        } catch {
          // Forward unrecognized lines verbatim for debug visibility.
          this.post({ kind: "debug", text: line.slice(0, 240) });
        }
      });
      if (acc) this.post({ kind: "assistant-final", text: acc });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.post({ kind: "error", text: msg });
    }
  }

  private post(message: { kind: string; text: string }): void {
    void this.view?.webview.postMessage(message);
  }

  private renderHtml(): string {
    // Inline stylesheet kept minimal — VS Code theme variables are the
    // defaults, so the panel automatically follows the user's theme.
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Agentrix Chat</title>
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; }
    #log { flex: 1; overflow-y: auto; padding: 8px; }
    .msg { padding: 6px 10px; margin: 4px 0; border-radius: 6px; white-space: pre-wrap; word-wrap: break-word; }
    .msg.user { background: var(--vscode-input-background); }
    .msg.assistant { background: var(--vscode-textBlockQuote-background); }
    .msg.system { font-size: 0.85em; opacity: 0.75; font-style: italic; }
    .msg.error { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
    .msg.debug { font-family: var(--vscode-editor-font-family); font-size: 0.8em; opacity: 0.5; }
    form { display: flex; padding: 8px; border-top: 1px solid var(--vscode-panel-border); gap: 6px; }
    input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 6px 8px; border-radius: 4px; font: inherit; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <div id="log"></div>
  <form id="form">
    <input id="input" placeholder="Ask Agentrix… (cross-tool memory + long tasks)" autocomplete="off" />
    <button type="submit">Send</button>
  </form>
  <script>
    const vscode = acquireVsCodeApi();
    const log = document.getElementById('log');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    let streamingEl = null;

    function renderLine(kind, text) {
      const el = document.createElement('div');
      el.className = 'msg ' + (kind.startsWith('assistant') ? 'assistant' : kind);
      el.textContent = text;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.kind === 'assistant-stream') {
        if (!streamingEl) {
          streamingEl = renderLine('assistant', msg.text);
        } else {
          streamingEl.textContent = msg.text;
          log.scrollTop = log.scrollHeight;
        }
      } else if (msg.kind === 'assistant-final') {
        if (streamingEl) {
          streamingEl.textContent = msg.text;
          streamingEl = null;
        } else {
          renderLine('assistant', msg.text);
        }
      } else {
        streamingEl = null;
        renderLine(msg.kind, msg.text);
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'send', text });
      input.value = '';
    });
  </script>
</body>
</html>`;
  }
}
