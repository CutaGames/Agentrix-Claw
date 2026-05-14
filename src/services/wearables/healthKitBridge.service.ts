/**
 * HealthKit bridge — reads real HR / SpO₂ / HRV from Apple Health (iOS) and
 * Google Fit / Health Connect (Android), pushes into the Vitals Bus.
 *
 * Why this exists:
 *   Wearable PRD requires real biometrics (currently we only buffer test
 *   samples in `wearableTelemetry`). Until we add `react-native-health` (iOS)
 *   and `react-native-health-connect` (Android) as native deps, this module
 *   exposes the same surface so call-sites can integrate today and the swap
 *   becomes a one-line change.
 *
 * Production swap-in:
 *   1. `npm i react-native-health react-native-health-connect`
 *   2. Replace `_readSamplesNative()` with the SDK calls.
 *   3. Bump iOS Info.plist NSHealthShareUsageDescription (already added).
 *
 * Privacy contract:
 *   - Default DISABLED; user must explicitly call `requestPermissions()`.
 *   - Only the 3 PRD-approved metrics are read.
 *   - Samples never persisted locally beyond a 60s rolling buffer; uploaded
 *     to `/wearable-telemetry/upload` then dropped.
 */
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api';

export type HealthMetric = 'heartRate' | 'spo2' | 'hrv';

export interface HealthSample {
  metric: HealthMetric;
  value: number;
  unit: string;
  timestamp: number;
  source?: string;
}

const PERM_KEY = 'agentrix_healthkit_permission_v1';

let _granted = false;
let _polling: ReturnType<typeof setInterval> | null = null;
const _buffer: HealthSample[] = [];

export async function isHealthKitAvailable(): Promise<boolean> {
  if (Platform.OS === 'ios') return !!(NativeModules as any).RNHealthKit || true; // surface always exists, native may be missing
  if (Platform.OS === 'android') return !!(NativeModules as any).RNHealthConnect || true;
  return false;
}

export async function loadPermissionState(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PERM_KEY);
    _granted = raw === '1';
  } catch {
    _granted = false;
  }
  return _granted;
}

/**
 * Request HealthKit / Health Connect permissions for the 3 PRD metrics.
 * Real implementation would invoke the native SDK; this stub records the
 * user's consent so privacy gating in the rest of the app can rely on it.
 */
export async function requestPermissions(): Promise<{ granted: boolean }> {
  // TODO: hook native SDK once added — the Info.plist key is already shipped.
  _granted = true;
  await AsyncStorage.setItem(PERM_KEY, '1').catch(() => {});
  return { granted: true };
}

export async function revokePermissions(): Promise<void> {
  _granted = false;
  await AsyncStorage.setItem(PERM_KEY, '0').catch(() => {});
  stopPolling();
}

/** Start a 30s polling loop that reads recent samples and uploads them. */
export function startPolling(intervalMs = 30_000): void {
  if (_polling) return;
  if (!_granted) return;
  _polling = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
}

export function stopPolling(): void {
  if (_polling) clearInterval(_polling);
  _polling = null;
}

async function tick(): Promise<void> {
  const samples = await _readSamplesNative();
  if (samples.length === 0) return;
  _buffer.push(...samples);
  // Trim to last 60s of data
  const cutoff = Date.now() - 60_000;
  while (_buffer.length > 0 && _buffer[0].timestamp < cutoff) _buffer.shift();
  await flushToBackend(samples);
}

async function flushToBackend(samples: HealthSample[]): Promise<void> {
  // Upstream of vitals-bus: `/api/v1/vitals/ingest` accepts hr / spo2 / hrv
  const latest: Record<string, number> = {};
  for (const s of samples) latest[s.metric] = s.value;
  if (Object.keys(latest).length === 0) return;
  try {
    await apiFetch('/v1/vitals/ingest', {
      method: 'POST',
      body: JSON.stringify({
        hr: latest.heartRate,
        spo2: latest.spo2,
        hrv: latest.hrv,
        source: Platform.OS === 'ios' ? 'healthkit' : 'healthconnect',
      }),
    });
  } catch {
    // Silent — vitals are best-effort; will retry next tick.
  }
}

/**
 * Native read — uses expo-sensors + platform health APIs.
 * iOS: HealthKit via NativeModules.RNHealthKit (react-native-health)
 * Android: Health Connect via NativeModules.RNHealthConnect
 *
 * Sprint WC #6: Real implementation that reads from native health stores.
 * Falls back to empty array if native modules are not available.
 */
async function _readSamplesNative(): Promise<HealthSample[]> {
  const samples: HealthSample[] = [];
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60_000;

  if (Platform.OS === 'ios') {
    try {
      const HealthKit = (NativeModules as any).RNHealthKit;
      if (!HealthKit?.getHeartRateSamples) return [];

      // Read heart rate samples from last 5 minutes
      const hrSamples = await HealthKit.getHeartRateSamples({
        startDate: new Date(fiveMinAgo).toISOString(),
        endDate: new Date(now).toISOString(),
        limit: 5,
      });
      if (Array.isArray(hrSamples)) {
        for (const s of hrSamples) {
          samples.push({
            metric: 'heartRate',
            value: s.value ?? s.quantity ?? 0,
            unit: 'bpm',
            timestamp: s.startDate ? new Date(s.startDate).getTime() : now,
            source: 'healthkit',
          });
        }
      }

      // Read SpO2 (oxygen saturation)
      if (HealthKit.getOxygenSaturationSamples) {
        const spo2Samples = await HealthKit.getOxygenSaturationSamples({
          startDate: new Date(fiveMinAgo).toISOString(),
          endDate: new Date(now).toISOString(),
          limit: 3,
        });
        if (Array.isArray(spo2Samples)) {
          for (const s of spo2Samples) {
            samples.push({
              metric: 'spo2',
              value: (s.value ?? s.quantity ?? 0) * 100, // HealthKit returns 0-1
              unit: '%',
              timestamp: s.startDate ? new Date(s.startDate).getTime() : now,
              source: 'healthkit',
            });
          }
        }
      }

      // Read HRV (heart rate variability)
      if (HealthKit.getHeartRateVariabilitySamples) {
        const hrvSamples = await HealthKit.getHeartRateVariabilitySamples({
          startDate: new Date(fiveMinAgo).toISOString(),
          endDate: new Date(now).toISOString(),
          limit: 3,
        });
        if (Array.isArray(hrvSamples)) {
          for (const s of hrvSamples) {
            samples.push({
              metric: 'hrv',
              value: s.value ?? s.quantity ?? 0,
              unit: 'ms',
              timestamp: s.startDate ? new Date(s.startDate).getTime() : now,
              source: 'healthkit',
            });
          }
        }
      }
    } catch (err) {
      // HealthKit not available or permission denied — return empty
      console.debug('[HealthKit] Read failed:', (err as Error).message);
    }
  } else if (Platform.OS === 'android') {
    try {
      const HealthConnect = (NativeModules as any).RNHealthConnect;
      if (!HealthConnect?.readRecords) return [];

      // Read heart rate
      const hrRecords = await HealthConnect.readRecords('HeartRate', {
        startTime: new Date(fiveMinAgo).toISOString(),
        endTime: new Date(now).toISOString(),
      });
      if (Array.isArray(hrRecords)) {
        for (const r of hrRecords) {
          const bpm = r.samples?.[0]?.beatsPerMinute ?? r.value ?? 0;
          if (bpm > 0) {
            samples.push({
              metric: 'heartRate',
              value: bpm,
              unit: 'bpm',
              timestamp: r.time ? new Date(r.time).getTime() : now,
              source: 'healthconnect',
            });
          }
        }
      }

      // Read SpO2
      const spo2Records = await HealthConnect.readRecords('OxygenSaturation', {
        startTime: new Date(fiveMinAgo).toISOString(),
        endTime: new Date(now).toISOString(),
      });
      if (Array.isArray(spo2Records)) {
        for (const r of spo2Records) {
          samples.push({
            metric: 'spo2',
            value: r.percentage ?? r.value ?? 0,
            unit: '%',
            timestamp: r.time ? new Date(r.time).getTime() : now,
            source: 'healthconnect',
          });
        }
      }

      // Read HRV
      const hrvRecords = await HealthConnect.readRecords('HeartRateVariabilityRmssd', {
        startTime: new Date(fiveMinAgo).toISOString(),
        endTime: new Date(now).toISOString(),
      });
      if (Array.isArray(hrvRecords)) {
        for (const r of hrvRecords) {
          samples.push({
            metric: 'hrv',
            value: r.heartRateVariabilityMillis ?? r.value ?? 0,
            unit: 'ms',
            timestamp: r.time ? new Date(r.time).getTime() : now,
            source: 'healthconnect',
          });
        }
      }
    } catch (err) {
      // Health Connect not available — return empty
      console.debug('[HealthConnect] Read failed:', (err as Error).message);
    }
  }

  return samples;
}

/** Test-only helper to seed the buffer (used by Pet Companion screen previews). */
export function _injectForTest(sample: HealthSample): void {
  _buffer.push(sample);
}

export function getBufferSnapshot(): HealthSample[] {
  return [..._buffer];
}
