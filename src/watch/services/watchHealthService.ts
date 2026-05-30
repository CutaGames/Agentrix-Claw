import { API_BASE } from '../../config/env';
import type { TelemetrySample, TelemetryUploadPayload } from '../../services/wearables/wearableTypes';

const DEVICE_ID = 'watch-builtin';
const DEVICE_NAME = 'Agentrix Watch';

/**
 * Upload buffered health samples to backend.
 */
export async function uploadHealthSamples(
  samples: TelemetrySample[],
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  if (samples.length === 0) return { success: true };

  const payload: TelemetryUploadPayload = {
    deviceId: DEVICE_ID,
    deviceName: DEVICE_NAME,
    samples,
    uploadedAt: new Date().toISOString(),
  };

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/wearable-telemetry/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Fetch latest device readings from backend.
 */
export async function fetchLatestReadings(
  token?: string,
): Promise<Record<string, number> | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/wearable-telemetry/devices/${DEVICE_ID}/latest`, {
      headers,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
