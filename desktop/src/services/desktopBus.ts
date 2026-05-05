/**
 * Cross-window UI event bus for the desktop app.
 *
 * The Agentrix desktop runs in two surfaces:
 *   - "main" window when collapsed = floating ball (resized to ~100x100)
 *   - "main" window when expanded = ChatPanel (resized to 1100x820 in Pro mode)
 *   - dev mode also has separate "chat-panel" / "floating-ball" labels
 *
 * Right-click actions on the floating ball must:
 *   1. NOT toggle the panel state (calling `onTap()` from a header FloatingBall
 *      closes Pro mode, making the panel disappear before it can render)
 *   2. Open Pro mode if it isn't already open, so the panel has somewhere to render
 *   3. Dispatch the action to the chat-panel listener
 *
 * This helper does both: open Pro mode (idempotent) then dispatch the event.
 * Listeners in ChatPanelImpl pick it up via `window.addEventListener`.
 */

export type DesktopUiAction =
  | "open-video-studio"
  | "open-pet-creator"
  | "open-settings"
  | "new-chat"
  | "voice-start";

const EVENT_PREFIX = "agentrix:";

async function ensureProMode(): Promise<void> {
  // If we're already inside the chat-panel/main window with Pro mode visible
  // there's nothing to open. The dispatched event below will be picked up.
  // If we're in the small floating-ball surface, ask Tauri to switch to Pro.
  try {
    const internals = (window as any).__TAURI_INTERNALS__;
    const label = internals?.metadata?.currentWindow?.label ?? "";
    // For both "main" (collapsed ball) and "floating-ball" (dev separate window)
    // we need to ensure Pro panel is open. The chat-panel window already has it.
    if (label !== "chat-panel") {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_open_chat_panel", { proMode: true }).catch(() => {});
      // The event listener is in ChatPanelImpl which mounts inside the
      // chat-panel/main window. Give the React tree a brief moment to mount
      // before dispatching.
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch {
    // If Tauri isn't available (browser dev), the in-window listener still works.
  }
}

/**
 * Dispatch a UI action that should land in ChatPanelImpl, opening Pro mode
 * first if necessary. Safe to call from any window/component.
 */
export async function dispatchUiAction(action: DesktopUiAction): Promise<void> {
  await ensureProMode();
  const eventName = `${EVENT_PREFIX}${action}`;
  // Same-window dispatch (works once Pro mode is mounted in this window).
  try {
    window.dispatchEvent(new CustomEvent(eventName));
  } catch {}
  // Cross-window dispatch via Tauri so listeners in another window also receive it.
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(eventName);
  } catch {}
}
