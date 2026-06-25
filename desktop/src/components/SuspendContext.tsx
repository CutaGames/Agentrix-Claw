/**
 * SuspendContext — React-friendly wrapper around services/suspend.ts.
 *
 * The Rust shell still calls `window.__agentrix_suspend()` /
 * `window.__agentrix_resume()` directly via webview.eval, so the original
 * imperative hooks in services/suspend.ts remain the source of truth.
 *
 * This Context exposes the same lifecycle as React state for components that
 * want to suspend/resume their own subscriptions or freeze heavy renders
 * (PetVRM, DreamPanel, ContextVisualizer).
 *
 * Usage:
 *   const { suspended } = useSuspend();
 *   useEffect(() => { if (suspended) myWorker.pause(); }, [suspended]);
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSuspended, onSuspend, onResume } from "../services/suspend";

interface SuspendContextValue {
  suspended: boolean;
}

const SuspendContext = createContext<SuspendContextValue>({ suspended: false });

export function SuspendProvider({ children }: { children: ReactNode }) {
  const [suspended, setSuspended] = useState<boolean>(() => isSuspended());

  useEffect(() => {
    const offS = onSuspend(() => setSuspended(true));
    const offR = onResume(() => setSuspended(false));
    return () => {
      offS();
      offR();
    };
  }, []);

  const value = useMemo(() => ({ suspended }), [suspended]);

  return <SuspendContext.Provider value={value}>{children}</SuspendContext.Provider>;
}

export function useSuspend(): SuspendContextValue {
  return useContext(SuspendContext);
}
