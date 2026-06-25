/**
 * Clipboard intelligence service.
 *
 * Polls the system clipboard every 2 seconds. When new text is detected,
 * fires a custom event so the FloatingBall can show quick-action options
 * (translate, summarize, explain, rewrite).
 */

let _polling = false;
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _lastClipText = "";

export interface ClipboardCapture {
  text: string;
  timestamp: number;
}

/** Start watching clipboard for changes */
export function startClipboardWatch() {
  if (_polling) return;
  _polling = true;

  // Seed with current clipboard if available
  readClipboard().then(t => { _lastClipText = t; }).catch(() => {});

  _pollTimer = setInterval(async () => {
    try {
      const text = await readClipboard();
      if (text && text !== _lastClipText && text.trim().length >= 2) {
        _lastClipText = text;
        const capture: ClipboardCapture = { text: text.slice(0, 2000), timestamp: Date.now() };
        window.dispatchEvent(
          new CustomEvent<ClipboardCapture>("agentrix:clipboard-capture", {
            detail: capture,
          }),
        );
        // Cross-device clipboard sync: forward to backend via socket event
        window.dispatchEvent(
          new CustomEvent("agentrix:clipboard-sync-out", { detail: capture }),
        );
      }
    } catch { /* clipboard read failed, skip */ }
  }, 2000);

  // Listen for clipboard arriving from other devices
  window.addEventListener("agentrix:clipboard-sync-in", _handleRemoteClip as EventListener);
}

function _handleRemoteClip(e: CustomEvent<ClipboardCapture>) {
  const { text } = e.detail;
  if (text && text !== _lastClipText) {
    _lastClipText = text;
    _lastRemoteClip = { text, timestamp: Date.now() };
    window.dispatchEvent(
      new CustomEvent("agentrix:clipboard-remote", { detail: _lastRemoteClip }),
    );
  }
}

let _lastRemoteClip: ClipboardCapture | null = null;

/** Get the last clipboard content received from another device */
export function getRemoteClipboard(): ClipboardCapture | null {
  return _lastRemoteClip;
}

/** Stop watching clipboard */
export function stopClipboardWatch() {
  _polling = false;
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  window.removeEventListener("agentrix:clipboard-sync-in", _handleRemoteClip as EventListener);
}

async function readClipboard(): Promise<string> {
  // Prefer Tauri clipboard plugin if available
  try {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    const t = await readText();
    return t ?? "";
  } catch { /* not in Tauri or plugin not loaded */ }

  // Fallback to browser Clipboard API (requires focus)
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

/** Quick-action types the user can pick from the clipboard badge */
export type ClipboardAction = "translate" | "summarize" | "explain" | "rewrite" | "ask";

/** Build the prompt for a clipboard quick-action */
export function buildClipboardPrompt(action: ClipboardAction, text: string): string {
  const truncated = text.slice(0, 1500);
  switch (action) {
    case "translate":
      return `Translate the following text. If it's in Chinese, translate to English; if in English, translate to Chinese. Keep formatting.\n\n${truncated}`;
    case "summarize":
      return `Summarize the following text concisely:\n\n${truncated}`;
    case "explain":
      return `Explain the following text in simple terms:\n\n${truncated}`;
    case "rewrite":
      return `Rewrite the following text to be clearer and more polished:\n\n${truncated}`;
    case "ask":
      return truncated;
  }
}
