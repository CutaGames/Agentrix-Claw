import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api';
import {
  type AgentVerificationEvent,
  type TelemetryUploadPayload,
  type WearableProfile,
} from './wearableTypes';

const PENDING_VERIFICATION_KEY = 'agentrix.wearables.pendingVerifications';
const MAX_PENDING_VERIFICATIONS = 20;

export interface WearableVerificationSyncResult {
  status: 'synced' | 'queued';
  error?: string;
}

type VerificationPayload = AgentVerificationEvent & {
  kind?: WearableProfile['kind'];
  supportTier?: WearableProfile['supportTier'];
};

export class WearableTelemetrySyncService {
  static async registerVerification(
    event: AgentVerificationEvent,
    profile?: WearableProfile,
  ): Promise<WearableVerificationSyncResult> {
    const payload = this.buildVerificationPayload(event, profile);

    try {
      await apiFetch('/wearable-telemetry/verification', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await this.flushPendingVerifications();
      return { status: 'synced' };
    } catch (error: unknown) {
      await this.enqueueVerification(payload);
      return {
        status: 'queued',
        error: error instanceof Error ? error.message : 'Verification sync failed',
      };
    }
  }

  static async flushPendingVerifications(): Promise<number> {
    const pending = await this.readPendingVerifications();
    if (pending.length === 0) {
      return 0;
    }

    const remaining: VerificationPayload[] = [];
    let synced = 0;

    for (const payload of pending) {
      try {
        await apiFetch('/wearable-telemetry/verification', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        synced += 1;
      } catch {
        remaining.push(payload);
      }
    }

    await AsyncStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(remaining));
    return synced;
  }

  static async uploadTelemetry(payload: TelemetryUploadPayload): Promise<void> {
    await this.flushPendingVerifications();
    await apiFetch('/wearable-telemetry/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  private static buildVerificationPayload(
    event: AgentVerificationEvent,
    profile?: WearableProfile,
  ): VerificationPayload {
    return {
      ...event,
      services: event.services ?? [],
      kind: profile?.kind,
      supportTier: profile?.supportTier,
    };
  }

  private static async enqueueVerification(payload: VerificationPayload): Promise<void> {
    const pending = await this.readPendingVerifications();
    const next = [
      payload,
      ...pending.filter((item) => item.deviceId !== payload.deviceId),
    ].slice(0, MAX_PENDING_VERIFICATIONS);
    await AsyncStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(next));
  }

  private static async readPendingVerifications(): Promise<VerificationPayload[]> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_VERIFICATION_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}