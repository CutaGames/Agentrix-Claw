// Sprint Pre-launch P-3 (2026-05-23) — User experience-mode store.
//
// Implements the "Simple / Standard / Pro" tiering called out in
// docs/agentrix-positioning-2026-05.zh-CN.md.
//
//   - Simple   (L1) — default. Non-coders. Hides chat-mode picker, tier
//                     router, More-menu's 9 panels, L0-L3 risk badges.
//                     Approval reads as 安全/确认/危险.
//   - Standard (L2) — exposes plan/agent/ask, tool call inline, diffs.
//   - Pro      (L3) — full depth: tier, memory wiki, persona, ide bridge.
//
// The store is intentionally tiny and fronted by a zustand hook so any
// component can subscribe with a fine-grained selector. We persist the
// choice to localStorage so a returning user gets the depth they picked.

import { create } from "zustand";

export type UserMode = "simple" | "standard" | "pro";

const LS_KEY = "agentrix_user_mode";

function readPersistedMode(): UserMode {
  try {
    const raw = (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY)) || "";
    if (raw === "simple" || raw === "standard" || raw === "pro") return raw;
  } catch { /* ignore */ }
  return "simple";
}

function persistMode(mode: UserMode) {
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch { /* ignore */ }
}

interface UserModeStore {
  mode: UserMode;
  setMode: (mode: UserMode) => void;
  /** Convenience predicates so call sites stay readable. */
  isSimple: () => boolean;
  isStandardOrAbove: () => boolean;
  isPro: () => boolean;
}

export const useUserModeStore = create<UserModeStore>((set, get) => ({
  mode: readPersistedMode(),
  setMode: (mode) => {
    persistMode(mode);
    set({ mode });
    try {
      window.dispatchEvent(new CustomEvent("agentrix:user-mode-changed", { detail: { mode } }));
    } catch { /* ignore SSR */ }
  },
  isSimple: () => get().mode === "simple",
  isStandardOrAbove: () => get().mode !== "simple",
  isPro: () => get().mode === "pro",
}));

// ── Convenience hooks for fine-grained subscription ────────────────────────

export const useUserMode = () => useUserModeStore((s) => s.mode);
export const useIsSimpleMode = () => useUserModeStore((s) => s.mode === "simple");
export const useIsProMode = () => useUserModeStore((s) => s.mode === "pro");
export const useIsStandardOrAbove = () => useUserModeStore((s) => s.mode !== "simple");
