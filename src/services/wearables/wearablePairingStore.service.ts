import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AgentVerificationEvent, type PairedWearableRecord, type WearableProfile } from './wearableTypes';

const STORAGE_KEY = 'agentrix.wearables.paired';

export class WearablePairingStoreService {
  static async list(): Promise<PairedWearableRecord[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as PairedWearableRecord[];
      return Array.isArray(parsed)
        ? parsed.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
        : [];
    } catch {
      return [];
    }
  }

  static async save(profile: WearableProfile, verificationEvent: AgentVerificationEvent): Promise<PairedWearableRecord[]> {
    const current = await this.list();
    const nextRecord: PairedWearableRecord = {
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      supportTier: profile.supportTier,
      serviceLabels: profile.serviceLabels,
      pairedAt: current.find((item) => item.id === profile.id)?.pairedAt ?? profile.connectedAt,
      lastSeenAt: profile.connectedAt,
      verificationEventType: verificationEvent.type,
    };

    const next = [nextRecord, ...current.filter((item) => item.id !== profile.id)].slice(0, 12);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  static async remove(deviceId: string): Promise<PairedWearableRecord[]> {
    const current = await this.list();
    const next = current.filter((item) => item.id !== deviceId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
}