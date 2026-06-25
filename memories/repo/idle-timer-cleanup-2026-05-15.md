# idle Timer Cleanup — Audit False Positive (2026-05-15)

## Claim from `docs/DESKTOP_GO_LIVE_AUDIT_2026-05-15.zh-CN.md` D-P1-5

> 闲置 15 分钟回 compact 模式的 idleTimer 没清理 mousemove listener，
> 长时间运行内存爬升

## Reality

`desktop/src/App.tsx` `useEffect` (line ~340) for the 15-min idle → compact
auto-switch is **already correctly written**:

```tsx
useEffect(() => {
  if (windowLabel !== "main" && windowLabel !== "dev") return;
  if (!panelOpen || panelMode !== "pro") return;
  const IDLE_MS = 15 * 60 * 1000;
  let lastActive = Date.now();
  const reset = () => { lastActive = Date.now(); };
  const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", ...];
  events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
  const interval = window.setInterval(() => { ... }, 30_000);
  return () => {
    events.forEach((ev) => window.removeEventListener(ev, reset));  // ✅
    window.clearInterval(interval);                                  // ✅
  };
}, [panelMode, panelOpen, windowLabel]);
```

The cleanup symmetrically removes all 5 listeners and clears the interval.
No leak.

## Locked in by

`desktop/src/test/idle-cleanup.test.tsx` — spies addEventListener /
removeEventListener and asserts symmetric calls when the effect re-runs or
the component unmounts.

## Action

D-P1-5 in the go-live audit is reclassified from **P1 (must fix)** to
**P2 (no-op, audit error)**. No code change required for Sprint G-1.
