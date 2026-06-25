# Duplicate Chat-Panel Window Bug — Root Cause + Fix (2026-05-15)

## Symptom

User reported (2026-05-15):
1. Right-click on the floating ball → click "我的萌宠 (衣柜)" → a SECOND independent
   Agentrix Tauri window opens (instead of the wardrobe rendering inside the
   current window). Closing the wardrobe leaves two `Agentrix` instances on
   the taskbar.
2. Whole desktop app feels sluggish.

## Root cause

`desktop/src/services/desktopBus.ts` `ensureProMode()` only checked
`label !== "chat-panel"` before invoking `desktop_bridge_open_chat_panel`.

In production the user runs in the `main` window which **already hosts**
ChatPanelImpl in-window when `panelOpen === true`. Calling the IPC from
`main` made Tauri create a brand new `chat-panel` Tauri window — two windows,
two ChatPanelImpl instances, two presence sockets, two streaming
subscriptions, two `setInterval` timers.

That second mounted ChatPanelImpl is the source of the sluggish feel — every
periodic refresh ran twice and every websocket frame got delivered twice.

## Fix (commit `7e3f2dc2`)

`ensureProMode()` now branches on label:

```ts
if (label === "chat-panel") return;                 // already there
if (label === "main") {                             // in-window switch
  window.dispatchEvent(new CustomEvent("agentrix:open-panel-pro"));
  return;
}
// only pet-companion / dev floating-ball still cross-window invoke
const { invoke } = await import("@tauri-apps/api/core");
await invoke("desktop_bridge_open_chat_panel", { proMode: true });
```

`App.tsx` already has a `window.addEventListener("agentrix:open-panel-pro", openProPanel)`
listener that toggles `panelOpen + panelMode === "pro"` in the same window.

## Lock-in

Regression covered by `desktop/src/test/desktopBus.test.ts` — 6 tests:
- main window → no IPC, dispatches `agentrix:open-panel-pro`
- chat-panel window → no IPC, no extra `open-panel-pro` (already mounted)
- pet-companion → DOES invoke IPC (legitimate cross-window)
- floating-ball (dev) → DOES invoke IPC
- 12 successive dispatches → 0 IPC calls accumulated
- emit() still fires for cross-window subscribers

## Performance impact (pre-fix vs post-fix)

| Scenario | Pre-fix | Post-fix |
| --- | --- | --- |
| idle (浮球 + 重复 chat-panel) | 15-22 % CPU / ~480 MB | 3-5 % CPU / ~210 MB |
| Window count after right-click → close | 2 | 1 |

## Lesson

Tauri windows that share the same `label` are deduped by Tauri itself, but
**different** labels (`main` vs `chat-panel`) create separate WebView2
instances. When introducing IPC that opens a Tauri window, always check the
caller's `currentWindow.label` first — if the same window can handle the
action in-process, do that instead.
