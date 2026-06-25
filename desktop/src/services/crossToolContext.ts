// Sprint Pre-launch P-4 (2026-05-23) — Cross-tool context memory.
//
// Tracks what the user is doing across other apps (Chrome / VS Code /
// Notion / etc) so the floating-pet "ambient context bar" can show
// "刚刚你在 Chrome 看了 X" / "VS Code 里改的 foo.ts" the agent has live
// awareness of, rather than only the current chat session.
//
// Implementation:
//   - Poll `desktop_bridge_get_active_window` every 8 s
//   - De-dupe consecutive same-window samples
//   - Keep a rolling buffer of the last 12 distinct contexts
//   - Persist to localStorage so the bar survives webview reload
//   - Broadcast `agentrix:cross-tool-context` for subscribers
//
// Privacy: nothing leaves the device. The `agent` only sees a user-
// chosen subset injected into prompts (next sprint). Right now this
// is purely a UI surface (the bar), so we deliberately limit detail
// to window title + process name, no body text / clipboard sniffing.

import { getActiveDesktopWindow } from "./desktop";

export interface CrossToolContextEntry {
  /** Window title at the time of capture. */
  title: string;
  /** OS process name (chrome.exe / Code.exe / WINWORD.EXE / ...). */
  processName: string;
  /** Categorized into a small enum for icons + grouping. */
  app: ToolApp;
  /** Capture timestamp (ms since epoch). */
  capturedAt: number;
}

export type ToolApp =
  | "chrome"
  | "edge"
  | "firefox"
  | "vscode"
  | "cursor"
  | "windsurf"
  | "office"
  | "terminal"
  | "agentrix"
  | "other";

const LS_KEY = "agentrix_cross_tool_context_v1";
const POLL_MS = 8_000;
const MAX_ENTRIES = 12;
const MIN_DURATION_MS = 4_000; // ignore quick window flickers

let pollHandle: number | null = null;
let lastSampleTitle = "";
let lastSampleAt = 0;

function classify(processName?: string | null): ToolApp {
  const p = (processName || "").toLowerCase();
  if (p.includes("agentrix") || p.includes("agentrix-desktop")) return "agentrix";
  if (p.includes("chrome")) return "chrome";
  if (p.includes("msedge") || p.includes("edge")) return "edge";
  if (p.includes("firefox")) return "firefox";
  if (p.includes("cursor")) return "cursor";
  if (p.includes("code") || p === "code") return "vscode";
  if (p.includes("windsurf")) return "windsurf";
  if (p.includes("winword") || p.includes("excel") || p.includes("powerpnt") || p.includes("outlook")) return "office";
  if (p.includes("cmd") || p.includes("powershell") || p.includes("pwsh") || p.includes("wt")) return "terminal";
  return "other";
}

function readEntries(): CrossToolContextEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as CrossToolContextEntry[]) : [];
  } catch { return []; }
}

function writeEntries(entries: CrossToolContextEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch { /* ignore */ }
}

function broadcast(latest: CrossToolContextEntry | null, all: CrossToolContextEntry[]) {
  try {
    window.dispatchEvent(new CustomEvent("agentrix:cross-tool-context", {
      detail: { latest, all },
    }));
  } catch { /* ignore */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getCrossToolContext(): CrossToolContextEntry[] {
  return readEntries();
}

export function getLatestCrossToolContext(): CrossToolContextEntry | null {
  const list = readEntries();
  return list.length > 0 ? list[list.length - 1] : null;
}

export function startCrossToolContextWatcher() {
  if (pollHandle !== null) return;

  const tick = async () => {
    try {
      const win = await getActiveDesktopWindow();
      if (!win || !win.title) return;
      const app = classify(win.processName);

      // Skip our own window: showing "Agentrix Desktop" in the bar is noise.
      if (app === "agentrix") return;

      const now = Date.now();
      // Same title as last sample? Just update the lastSampleAt to mark
      // dwell time, but only commit a new entry if we've been there long
      // enough to not be a click-through.
      if (lastSampleTitle === win.title) {
        if (now - lastSampleAt >= MIN_DURATION_MS) {
          const entries = readEntries();
          const tail = entries[entries.length - 1];
          if (!tail || tail.title !== win.title) {
            // commit
            const entry: CrossToolContextEntry = {
              title: win.title.slice(0, 200),
              processName: win.processName || "unknown",
              app,
              capturedAt: now,
            };
            entries.push(entry);
            writeEntries(entries);
            broadcast(entry, entries.slice(-MAX_ENTRIES));
          }
        }
        return;
      }
      lastSampleTitle = win.title;
      lastSampleAt = now;
    } catch {
      /* ignore — desktop_bridge_get_active_window unavailable in dev */
    }
  };

  // Fire one immediately so the bar populates on boot.
  void tick();
  pollHandle = window.setInterval(tick, POLL_MS);
}

export function stopCrossToolContextWatcher() {
  if (pollHandle !== null) {
    window.clearInterval(pollHandle);
    pollHandle = null;
  }
}
