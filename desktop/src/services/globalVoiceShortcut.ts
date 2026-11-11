/**
 * Global Voice Shortcut Service — Desktop
 *
 * Listens for the `agentrix:voice-activate` custom event dispatched by:
 * - System tray "Voice Chat" menu item
 * - Global shortcut Ctrl+Shift+V
 * - Porcupine WASM wake word detection
 *
 * When triggered, activates duplex voice mode in the chat panel.
 */

export type VoiceActivateHandler = () => void;

let handler: VoiceActivateHandler | null = null;

/**
 * Register a handler for global voice activation events.
 * Call this from ChatPanel on mount.
 */
export function onGlobalVoiceActivate(callback: VoiceActivateHandler): () => void {
  handler = callback;

  const listener = () => {
    handler?.();
  };

  window.addEventListener('agentrix:voice-activate', listener);

  return () => {
    window.removeEventListener('agentrix:voice-activate', listener);
    if (handler === callback) handler = null;
  };
}

/**
 * Programmatically trigger voice activation (e.g. from wake word service).
 */
export function triggerVoiceActivate(): void {
  window.dispatchEvent(new CustomEvent('agentrix:voice-activate'));
}
