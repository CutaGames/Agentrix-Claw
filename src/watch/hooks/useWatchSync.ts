import { useEffect, useRef, useCallback, useState } from 'react';
import { API_BASE } from '../../config/env';
import type { TelemetrySample } from '../../services/wearables/wearableTypes';

interface SyncState {
  lastUploadAt: string | null;
  samplesUploaded: number;
  error: string | null;
}

/**
 * Background sync hook — periodically uploads buffered sensor data to backend.
 */
export function useWatchSync(
  flushBuffer: () => TelemetrySample[],
  intervalMs = 60_000,
  token?: string | null,
) {
  const [state, setState] = useState<SyncState>({
    lastUploadAt: null,
    samplesUploaded: 0,
    error: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const upload = useCallback(async () => {
    const samples = flushBuffer();
    if (samples.length === 0) return;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/wearable-telemetry/upload`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: 'watch-builtin',
          deviceName: 'Agentrix Watch',
          samples,
          uploadedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setState((prev) => ({
        lastUploadAt: new Date().toISOString(),
        samplesUploaded: prev.samplesUploaded + samples.length,
        error: null,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [flushBuffer, token]);

  useEffect(() => {
    timerRef.current = setInterval(upload, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [upload, intervalMs]);

  return { ...state, uploadNow: upload };
}
