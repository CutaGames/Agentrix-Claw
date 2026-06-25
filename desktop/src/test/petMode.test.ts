/**
 * petMode bus tests — Sprint P-2 (2026-05-21).
 *
 * Locks the contract between feature-event broadcasters
 * (`agentrix:voice-start`, `agentrix:cu-active`, etc.) and the
 * unified `PetMode` bus consumed by PetCompanionWindow + PetAvatar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  PET_MODE_TO_SPRITE,
  bootPetModeBus,
  getPetMode,
  setPetMode,
  subscribePetMode,
} from "../services/petMode";

describe("petMode bus", () => {
  beforeEach(() => {
    // Reset to idle between tests. setPetMode is a no-op when the new
    // mode equals the current one, so flip via a bogus mode first.
    setPetMode("speaking", "test-reset-prep");
    setPetMode("idle", "test-reset");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setPetMode dispatches a CustomEvent to subscribers", () => {
    const calls: Array<{ mode: string; source: string }> = [];
    const unsub = subscribePetMode((mode, source) => calls.push({ mode, source }));

    setPetMode("listening", "voice-start");
    setPetMode("typing", "llm-typing");

    expect(calls).toEqual([
      { mode: "listening", source: "voice-start" },
      { mode: "typing", source: "llm-typing" },
    ]);
    expect(getPetMode()).toBe("typing");
    unsub();
  });

  it("setPetMode is idempotent on the same mode", () => {
    const calls: string[] = [];
    const unsub = subscribePetMode((mode) => calls.push(mode));
    setPetMode("listening", "first");
    setPetMode("listening", "duplicate");
    expect(calls).toEqual(["listening"]);
    unsub();
  });

  it("ttlMs auto-reverts to idle after the timer fires", () => {
    vi.useFakeTimers();
    setPetMode("done", "celebration", 500);
    expect(getPetMode()).toBe("done");
    vi.advanceTimersByTime(499);
    expect(getPetMode()).toBe("done");
    vi.advanceTimersByTime(2);
    expect(getPetMode()).toBe("idle");
  });

  it("PET_MODE_TO_SPRITE has a sprite for every PetMode", () => {
    const required = [
      "idle", "listening", "speaking", "thinking", "typing", "done",
      "sleep", "wardrobe", "computer-use", "approval",
    ] as const;
    for (const mode of required) {
      expect(typeof PET_MODE_TO_SPRITE[mode]).toBe("string");
      expect(PET_MODE_TO_SPRITE[mode].length).toBeGreaterThan(0);
    }
  });

  describe("bootPetModeBus event wiring", () => {
    beforeEach(() => {
      // Re-run boot to pick up a fresh listener set in jsdom. The bus
      // is idempotent so multiple boots is fine; the second call is a
      // no-op (`_wiredUp` flag).
      bootPetModeBus();
    });

    it("voice-start sets listening, voice-stop reverts to idle", () => {
      window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
      expect(getPetMode()).toBe("listening");
      window.dispatchEvent(new CustomEvent("agentrix:voice-stop"));
      expect(getPetMode()).toBe("idle");
    });

    it("llm-stream-start defaults to speaking when Pro Mode is closed", () => {
      // Ensure Pro Mode reported closed
      window.dispatchEvent(
        new CustomEvent("agentrix:app-mode-changed", { detail: { mode: "living-agent" } }),
      );
      window.dispatchEvent(new CustomEvent("agentrix:llm-stream-start"));
      expect(getPetMode()).toBe("speaking");
    });

    it("llm-stream-start switches to thinking when Pro Mode is open", () => {
      window.dispatchEvent(
        new CustomEvent("agentrix:app-mode-changed", { detail: { mode: "pro-mode" } }),
      );
      window.dispatchEvent(new CustomEvent("agentrix:llm-stream-start"));
      expect(getPetMode()).toBe("thinking");
    });

    it("llm-stream-typing flips thinking → typing in Pro Mode (Sprint P-4)", () => {
      window.dispatchEvent(
        new CustomEvent("agentrix:app-mode-changed", { detail: { mode: "pro-mode" } }),
      );
      window.dispatchEvent(new CustomEvent("agentrix:llm-stream-start"));
      expect(getPetMode()).toBe("thinking");
      window.dispatchEvent(new CustomEvent("agentrix:llm-stream-typing"));
      expect(getPetMode()).toBe("typing");
    });

    it("llm-stream-typing is a no-op when Pro Mode is closed (Sprint P-4)", () => {
      window.dispatchEvent(
        new CustomEvent("agentrix:app-mode-changed", { detail: { mode: "living-agent" } }),
      );
      window.dispatchEvent(new CustomEvent("agentrix:llm-stream-start"));
      expect(getPetMode()).toBe("speaking");
      window.dispatchEvent(new CustomEvent("agentrix:llm-stream-typing"));
      // Stays in speaking — typing sprite is reserved for Pro Mode.
      expect(getPetMode()).toBe("speaking");
    });

    it("cu-active toggles computer-use mode", () => {
      window.dispatchEvent(
        new CustomEvent("agentrix:cu-active", { detail: { active: true } }),
      );
      expect(getPetMode()).toBe("computer-use");
      window.dispatchEvent(
        new CustomEvent("agentrix:cu-active", { detail: { active: false } }),
      );
      expect(getPetMode()).toBe("idle");
    });

    it("approval-active toggles approval mode", () => {
      window.dispatchEvent(
        new CustomEvent("agentrix:approval-active", { detail: { active: true } }),
      );
      expect(getPetMode()).toBe("approval");
      window.dispatchEvent(
        new CustomEvent("agentrix:approval-active", { detail: { active: false } }),
      );
      expect(getPetMode()).toBe("idle");
    });
  });
});
