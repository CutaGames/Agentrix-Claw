/**
 * desktopBus — multi-window routing regression tests.
 *
 * Locks in the fix for the duplicate-window bug observed on 2026-05-15:
 * right-click on the floating ball in the `main` window must NOT spawn a
 * second `chat-panel` Tauri window. See:
 *   - docs/DESKTOP_GO_LIVE_AUDIT_2026-05-15.zh-CN.md (D-P0-1 / D-P0-2)
 *   - .kiro/specs/desktop-go-live/requirements.md (US-G1-1)
 *   - commit 7e3f2dc2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { dispatchUiAction } from "../services/desktopBus";

const invokeMock = vi.mocked(invoke);
const emitMock = vi.mocked(emit);

function setWindowLabel(label: string): void {
  (window as any).__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label } },
  };
}

function clearWindowLabel(): void {
  delete (window as any).__TAURI_INTERNALS__;
}

describe("desktopBus.dispatchUiAction — window-label-aware routing", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    emitMock.mockClear();
  });

  afterEach(() => {
    clearWindowLabel();
  });

  it("main window: dispatches in-window event, does NOT invoke desktop_bridge_open_chat_panel", async () => {
    setWindowLabel("main");

    const sameWindowEvents: string[] = [];
    function captureEvent(e: Event) {
      sameWindowEvents.push(e.type);
    }
    window.addEventListener("agentrix:open-panel-pro", captureEvent);
    window.addEventListener("agentrix:open-wardrobe", captureEvent);

    try {
      await dispatchUiAction("open-wardrobe");
    } finally {
      window.removeEventListener("agentrix:open-panel-pro", captureEvent);
      window.removeEventListener("agentrix:open-wardrobe", captureEvent);
    }

    // CRITICAL: must not call the IPC that creates a second window
    expect(invokeMock).not.toHaveBeenCalledWith(
      "desktop_bridge_open_chat_panel",
      expect.anything(),
    );

    // Must instead toggle Pro mode in the current window
    expect(sameWindowEvents).toContain("agentrix:open-panel-pro");
    expect(sameWindowEvents).toContain("agentrix:open-wardrobe");
  });

  it("chat-panel window: skips IPC AND skips Pro-mode toggle (already mounted)", async () => {
    setWindowLabel("chat-panel");

    const seen: string[] = [];
    function capture(e: Event) {
      seen.push(e.type);
    }
    window.addEventListener("agentrix:open-panel-pro", capture);
    window.addEventListener("agentrix:open-wardrobe", capture);

    try {
      await dispatchUiAction("open-wardrobe");
    } finally {
      window.removeEventListener("agentrix:open-panel-pro", capture);
      window.removeEventListener("agentrix:open-wardrobe", capture);
    }

    expect(invokeMock).not.toHaveBeenCalledWith(
      "desktop_bridge_open_chat_panel",
      expect.anything(),
    );
    // chat-panel already has ChatPanelImpl — no need to toggle Pro mode
    expect(seen).not.toContain("agentrix:open-panel-pro");
    expect(seen).toContain("agentrix:open-wardrobe");
  });

  it("pet-companion window: DOES invoke desktop_bridge_open_chat_panel (legitimate cross-window)", async () => {
    setWindowLabel("pet-companion");

    await dispatchUiAction("open-wardrobe");

    expect(invokeMock).toHaveBeenCalledWith(
      "desktop_bridge_open_chat_panel",
      expect.objectContaining({ proMode: true }),
    );
  });

  it("dev-only floating-ball window: DOES invoke desktop_bridge_open_chat_panel", async () => {
    setWindowLabel("floating-ball");

    await dispatchUiAction("open-pet-creator");

    expect(invokeMock).toHaveBeenCalledWith(
      "desktop_bridge_open_chat_panel",
      expect.objectContaining({ proMode: true }),
    );
  });

  it("repeated dispatches in main window do NOT accumulate IPC calls (regression for window stacking)", async () => {
    setWindowLabel("main");

    const actions = [
      "open-wardrobe",
      "open-pet-creator",
      "open-pet-growth",
      "open-video-studio",
      "open-settings",
      "open-soul-picker",
      "open-pet-memory-album",
      "open-pet-minigames",
      "open-pet-breeding",
      "new-chat",
      "open-pet-achievements",
      "voice-start",
    ] as const;

    for (const action of actions) {
      await dispatchUiAction(action);
    }

    const ipcOpenCalls = invokeMock.mock.calls.filter(
      ([cmd]) => cmd === "desktop_bridge_open_chat_panel",
    );
    expect(ipcOpenCalls).toHaveLength(0);
  });

  it("cross-window emit() always fires so other windows that are listening still receive the action", async () => {
    setWindowLabel("main");
    await dispatchUiAction("open-wardrobe");
    expect(emitMock).toHaveBeenCalledWith("agentrix:open-wardrobe");
  });
});
