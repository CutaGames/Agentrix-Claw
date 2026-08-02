import { useEffect, useRef, useState, useCallback } from 'react';
import type { TelemetryChannel, TelemetrySample } from '../../services/wearables/wearableTypes';

export interface WatchSensorData {
  heartRate: number | null;
  steps: number | null;
  battery: number | null;
  spo2: number | null;
}

/**
 * Hook to read watch sensor data.
 * MVP: simulated data with configurable interval.
 * TODO: Replace with Android Health Services API for real Wear OS.
 */
export function useWatchSensors(intervalMs = 2000) {
  const [data, setData] = useState<WatchSensorData>({
    heartRate: null,
    steps: null,
    battery: null,
    spo2: null,
  });
  const [collecting, setCollecting] = useState(false);
  const bufferRef = useRef<TelemetrySample[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const start = useCallback(() => {
    if (timerRef.current) return;
    setCollecting(true);
    timerRef.current = setInterval(() => {
      const now = new Date().toISOString();
      const hr = 60 + Math.floor(Math.random() * 40);
      const steps = 2000 + Math.floor(Math.random() * 8000);
      const battery = Math.floor(50 + Math.random() * 50);
      const spo2 = 95 + Math.floor(Math.random() * 5);

      setData({ heartRate: hr, steps, battery, spo2 });

      // Buffer samples for upload
      const makeSample = (
        channel: TelemetryChannel,
        value: number,
        unit: string,
      ): TelemetrySample => ({
        id: `${channel}-${Date.now()}`,
        deviceId: 'watch-builtin',
        channel,
        value,
        unit,
        rawBase64: null,
        characteristicUuid: '',
        serviceUuid: '',
        timestamp: now,
      });

      bufferRef.current.push(
        makeSample('heart_rate', hr, 'bpm'),
        makeSample('steps', steps, 'steps'),
        makeSample('battery', battery, '%'),
        makeSample('spo2', spo2, '%'),
      );
    }, intervalMs);
  }, [intervalMs]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    setCollecting(false);
  }, []);

  const flushBuffer = useCallback((): TelemetrySample[] => {
    const samples = [...bufferRef.current];
    bufferRef.current = [];
    return samples;
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { data, collecting, start, stop, flushBuffer };
}
