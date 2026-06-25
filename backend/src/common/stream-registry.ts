/**
 * v0.7.14 — Active SSE Stream Registry + Graceful Shutdown Helper
 *
 * Root cause of "几秒就网络中断":
 *   PM2 was issuing SIGINT to agentrix-backend an average of 100+ times per
 *   day (5910 restarts in 52 days). Default PM2 kill_timeout is 1600ms; once
 *   SIGINT lands, the Node process is forcibly killed within seconds and
 *   every active SSE connection gets RST'd mid-stream. Clients see this as
 *   `TypeError: network error` (WebView2) or `error decoding response body`
 *   (reqwest), neither of which is a real network problem.
 *
 * This module fixes the SYMPTOM properly:
 *   - Every active SSE handler registers its `Response` so we know who's
 *     streaming.
 *   - On SIGINT/SIGTERM, we walk the registry, emit a final structured
 *     `{type:'error', error:'server-restart', retriable:true}` to each, then
 *     end the response cleanly. Clients can show "服务器升级中,请重试" instead
 *     of a generic network error and the chat surface keeps working.
 *   - We delay process.exit by up to 8s (PM2 kill_timeout will be raised in
 *     ecosystem config to match) so streams have a fighting chance to flush.
 *
 * The ROOT cause (whoever is restarting PM2 every few minutes) is a separate
 * operational matter — likely an auto-deploy script or watcher hooked to git
 * webhook. That's a Day-2 cleanup; this graceful path is the immediate fix
 * so user task execution stops getting murdered mid-flight.
 */

import type { Response } from 'express';

interface RegisteredStream {
  res: Response;
  startedAt: number;
  traceId: string;
  /** Optional cleanup callback (e.g. clear heartbeat interval). */
  onShutdown?: () => void;
}

const _activeStreams = new Set<RegisteredStream>();
let _shuttingDown = false;

export function registerSseStream(entry: RegisteredStream): () => void {
  if (_shuttingDown) {
    // Don't accept new streams during shutdown — fail fast.
    try {
      entry.res.write(
        `data: ${JSON.stringify({ type: 'error', error: 'server-restart', retriable: true })}\n\n`,
      );
      entry.res.write('data: [DONE]\n\n');
      entry.res.end();
    } catch { /* ignore */ }
    return () => undefined;
  }
  _activeStreams.add(entry);
  return () => {
    _activeStreams.delete(entry);
  };
}

export function getActiveStreamCount(): number {
  return _activeStreams.size;
}

export function isShuttingDown(): boolean {
  return _shuttingDown;
}

/**
 * Drain all active streams, telling each client this is a server-restart
 * (NOT a network drop). Returns when every stream has been ended OR the
 * timeout elapses, whichever is sooner.
 */
export async function drainActiveStreams(timeoutMs = 6_000): Promise<{ drained: number; timedOut: boolean }> {
  if (_shuttingDown) return { drained: 0, timedOut: false };
  _shuttingDown = true;

  const streams = Array.from(_activeStreams);
  for (const entry of streams) {
    try {
      // Tell the client this is a graceful restart so it can show a friendly
      // message and (optionally) auto-retry instead of surfacing as a generic
      // "network error".
      if (!entry.res.writableEnded) {
        entry.res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: 'server-restart',
            retriable: true,
            code: 'BACKEND_GRACEFUL_RESTART',
          })}\n\n`,
        );
        entry.res.write('data: [DONE]\n\n');
        entry.res.end();
      }
    } catch { /* socket already gone */ }
    try { entry.onShutdown?.(); } catch { /* ignore */ }
    _activeStreams.delete(entry);
  }

  const start = Date.now();
  while (_activeStreams.size > 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    drained: streams.length,
    timedOut: _activeStreams.size > 0,
  };
}
