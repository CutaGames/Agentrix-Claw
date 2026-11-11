// Sprint Pre-launch P-1 (2026-05-23) — Feedback timer isolation hook.
//
// Previously the 2-second `setFeedbackNow(Date.now())` interval lived inside
// ChatPanelImpl and triggered a re-render of the whole 3708-line component
// every 2 s while a turn was streaming. That re-render reconciled all 30+
// secondary panel mounts and recalculated the giant `[style*=]` cascade in
// `global.css`, which the in-source comment already flagged as "a major
// source of typing lag".
//
// This hook:
//
// 1) Drives the `feedbackNow` slice of `useUiFeedbackStore` from a single
//    centralized 2-second tick that only runs when there's actually
//    something to time (`sendStartedAt` set OR `activeToolRun` set).
// 2) Exposes the derived `visibleStreamFeedback` value via a fine-grained
//    subscription so ONLY the consumer (`<StreamFeedbackBar>` inside
//    InputZone) re-renders on tick. ChatPanelImpl itself does not.

import { useEffect, useMemo } from "react";
import {
  useActiveToolRun,
  useFeedbackNow,
  useSendStartedAt,
  useStreamFeedback,
  useUiFeedbackStore,
} from "./uiFeedbackStore";
import type { StreamFeedback } from "./uiFeedbackStore";

/**
 * Mount-once side-effect that runs the 2-second tick when a turn is in
 * flight. Place this at the ChatPanelImpl top-level so the tick lifecycle
 * is tied to ChatPanel mount, but the resulting state lives in zustand
 * (so updating it does NOT re-render ChatPanelImpl).
 */
export function useFeedbackTickDriver() {
  // We need to know whether to start the timer; subscribing here is fine
  // because these change at most once per turn (not every 2s).
  const sendStartedAt = useSendStartedAt();
  const activeToolRun = useActiveToolRun();

  useEffect(() => {
    if (!sendStartedAt && !activeToolRun) return;
    // Set immediately so the first frame after sendStartedAt has correct
    // elapsed seconds.
    useUiFeedbackStore.getState().setFeedbackNow(Date.now());
    const timer = window.setInterval(() => {
      useUiFeedbackStore.getState().setFeedbackNow(Date.now());
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeToolRun, sendStartedAt]);
}

/**
 * Computes `visibleStreamFeedback` from store. Subscribing components
 * re-render at the 2s tick rate but ChatPanelImpl no longer does.
 */
export function useVisibleStreamFeedback(): StreamFeedback | null {
  const streamFeedback = useStreamFeedback();
  const activeToolRun = useActiveToolRun();
  const sendStartedAt = useSendStartedAt();
  const feedbackNow = useFeedbackNow();

  const elapsedSeconds = useMemo(() => {
    const start = activeToolRun?.startedAt || sendStartedAt;
    if (!start) return 0;
    return Math.max(1, Math.round((feedbackNow - start) / 1000));
  }, [activeToolRun?.startedAt, feedbackNow, sendStartedAt]);

  return useMemo(() => {
    if (!streamFeedback) return null;
    if (activeToolRun) {
      return {
        ...streamFeedback,
        detail: streamFeedback.detail
          ? `${streamFeedback.detail} · ${elapsedSeconds}s`
          : `${activeToolRun.status || "running"} · ${elapsedSeconds}s`,
      };
    }
    if (sendStartedAt && (streamFeedback.tone === "info" || streamFeedback.tone === "warning")) {
      return {
        ...streamFeedback,
        detail: streamFeedback.detail
          ? `${streamFeedback.detail} · ${elapsedSeconds}s`
          : `${elapsedSeconds}s`,
      };
    }
    return streamFeedback;
  }, [activeToolRun, elapsedSeconds, sendStartedAt, streamFeedback]);
}
