/**
 * Cross-Device Compute Mesh — tier routing client.
 * See docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05 §D-MESH Phase 1.
 */
import { apiFetch } from './api';

export type ExecutionPreference = 'auto' | 'cloud' | 'desktop' | 'local';
export type ComputeCapability = 'pet_gen' | 'video_gen' | 'llm';

export interface CapableDevice {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  lastSeenAt: string;
  gpu: string | null;
  petGenReady: boolean;
  videoGenReady: boolean;
  localLlmReady: boolean;
}

export async function fetchCapableDevices(
  requires: ComputeCapability = 'pet_gen',
): Promise<{ items: CapableDevice[]; total: number }> {
  return apiFetch(`/v1/compute/devices?requires=${encodeURIComponent(requires)}`);
}
