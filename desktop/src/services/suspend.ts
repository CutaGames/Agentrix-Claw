/**
 * WebView memory reclaim hooks.
 *
 * When the chat-panel has been hidden for 5 minutes, the Rust side calls
 * `window.__agentrix_suspend()` to free memory. When the panel is re-shown,
 * `window.__agentrix_resume()` is called to restore state.
 */

type SuspendCallback = () => void;
type ResumeCallback = () => void;

const _suspendHooks: SuspendCallback[] = [];
const _resumeHooks: ResumeCallback[] = [];
let _suspended = false;

export function onSuspend(fn: SuspendCallback): () => void {
  _suspendHooks.push(fn);
  return () => {
    const idx = _suspendHooks.indexOf(fn);
    if (idx >= 0) _suspendHooks.splice(idx, 1);
  };
}

export function onResume(fn: ResumeCallback): () => void {
  _resumeHooks.push(fn);
  return () => {
    const idx = _resumeHooks.indexOf(fn);
    if (idx >= 0) _resumeHooks.splice(idx, 1);
  };
}

export function isSuspended(): boolean {
  return _suspended;
}

function suspend() {
  if (_suspended) return;
  _suspended = true;
  for (const fn of _suspendHooks) {
    try { fn(); } catch {}
  }
}

function resume() {
  if (!_suspended) return;
  _suspended = false;
  for (const fn of _resumeHooks) {
    try { fn(); } catch {}
  }
}

// Expose on window for Rust to call via webview.eval()
(window as any).__agentrix_suspend = suspend;
(window as any).__agentrix_resume = resume;
