import { apiClient } from './client';

// ── Types ────────────────────────────────────────────────────────────────────

export type TelemetryChannel = 'heart_rate' | 'spo2' | 'temperature' | 'steps' | 'battery' | 'accelerometer' | 'custom';
export type TriggerCondition = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'change' | 'absent';
export type TriggerAction = 'notify_agent' | 'log_event' | 'send_alert' | 'execute_skill' | 'update_context';

export interface TelemetrySample {
  id: string;
  deviceId: string;
  channel: TelemetryChannel;
  value: number;
  unit: string;
  rawBase64?: string;
  characteristicUuid?: string;
  serviceUuid?: string;
  sampleTimestamp: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  deviceId: string;
  channel: TelemetryChannel;
  condition: TriggerCondition;
  threshold: number;
  thresholdHigh?: number;
  windowMs: number;
  cooldownMs: number;
  action: TriggerAction;
  actionPayload: Record<string, unknown>;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
}

export interface TriggerEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  deviceId: string;
  channel: TelemetryChannel;
  value: number;
  condition: TriggerCondition;
  threshold: number;
  action: TriggerAction;
  actionPayload: Record<string, unknown>;
  acknowledged: boolean;
  triggeredAt: string;
}

export interface TelemetryStats {
  totalSamples: number;
  channelCounts: Record<string, number>;
  oldestSample: string | null;
  newestSample: string | null;
}

export interface LatestReadings {
  [channel: string]: { value: number; unit: string; timestamp: string };
}

export interface WearableVerificationEventDto {
  type: 'wearable.phase1_verified';
  source?: string;
  deviceId: string;
  deviceName: string;
  services: string[];
  firstReadableCharacteristicUuid?: string | null;
  payloadPreview?: string | null;
  kind?: string;
  supportTier?: string;
}

// ── API ──────────────────────────────────────────────────────────────────────

export const wearableTelemetryApi = {
  // ── Telemetry Data ──

  uploadSamples: async (dto: {
    deviceId: string;
    deviceName: string;
    samples: Array<{
      deviceId: string;
      channel: TelemetryChannel;
      value: number;
      unit: string;
      rawBase64?: string;
      characteristicUuid?: string;
      serviceUuid?: string;
      timestamp: string;
    }>;
  }): Promise<{ inserted: number }> => {
    const result = await apiClient.post<{ inserted: number }>('/wearable-telemetry/upload', dto);
    return result ?? { inserted: 0 };
  },

  registerVerification: async (dto: WearableVerificationEventDto): Promise<TriggerEvent> => {
    const result = await apiClient.post<TriggerEvent>('/wearable-telemetry/verification', dto);
    if (!result) throw new Error('Failed to register wearable verification');
    return result;
  },

  querySamples: async (query?: {
    deviceId?: string;
    channel?: TelemetryChannel;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<TelemetrySample[]> => {
    const params = new URLSearchParams();
    if (query?.deviceId) params.append('deviceId', query.deviceId);
    if (query?.channel) params.append('channel', query.channel);
    if (query?.from) params.append('from', query.from);
    if (query?.to) params.append('to', query.to);
    if (query?.limit) params.append('limit', query.limit.toString());
    const qs = params.toString();
    const result = await apiClient.get<TelemetrySample[]>(`/wearable-telemetry/samples${qs ? `?${qs}` : ''}`);
    return result ?? [];
  },

  getLatestReadings: async (deviceId: string): Promise<LatestReadings> => {
    const result = await apiClient.get<LatestReadings>(`/wearable-telemetry/devices/${deviceId}/latest`);
    return result ?? {};
  },

  getStats: async (deviceId: string): Promise<TelemetryStats> => {
    const result = await apiClient.get<TelemetryStats>(`/wearable-telemetry/devices/${deviceId}/stats`);
    return result ?? { totalSamples: 0, channelCounts: {}, oldestSample: null, newestSample: null };
  },

  // ── Automation Rules ──

  createRule: async (dto: {
    name: string;
    deviceId: string;
    channel: TelemetryChannel;
    condition: TriggerCondition;
    threshold: number;
    thresholdHigh?: number;
    windowMs?: number;
    cooldownMs?: number;
    action: TriggerAction;
    actionPayload?: Record<string, unknown>;
  }): Promise<AutomationRule> => {
    const result = await apiClient.post<AutomationRule>('/wearable-telemetry/rules', dto);
    if (!result) throw new Error('Failed to create rule');
    return result;
  },

  listRules: async (deviceId?: string): Promise<AutomationRule[]> => {
    const qs = deviceId ? `?deviceId=${deviceId}` : '';
    const result = await apiClient.get<AutomationRule[]>(`/wearable-telemetry/rules${qs}`);
    return result ?? [];
  },

  updateRule: async (ruleId: string, dto: Partial<AutomationRule>): Promise<AutomationRule> => {
    const result = await apiClient.patch<AutomationRule>(`/wearable-telemetry/rules/${ruleId}`, dto);
    if (!result) throw new Error('Failed to update rule');
    return result;
  },

  toggleRule: async (ruleId: string): Promise<AutomationRule> => {
    const result = await apiClient.post<AutomationRule>(`/wearable-telemetry/rules/${ruleId}/toggle`, {});
    if (!result) throw new Error('Failed to toggle rule');
    return result;
  },

  deleteRule: async (ruleId: string): Promise<{ deleted: boolean }> => {
    const result = await apiClient.delete<{ deleted: boolean }>(`/wearable-telemetry/rules/${ruleId}`);
    return result ?? { deleted: false };
  },

  // ── Trigger Events ──

  listTriggers: async (limit?: number): Promise<TriggerEvent[]> => {
    const qs = limit ? `?limit=${limit}` : '';
    const result = await apiClient.get<TriggerEvent[]>(`/wearable-telemetry/triggers${qs}`);
    return result ?? [];
  },

  acknowledgeTrigger: async (eventId: string): Promise<{ acknowledged: boolean }> => {
    const result = await apiClient.post<{ acknowledged: boolean }>(`/wearable-telemetry/triggers/${eventId}/acknowledge`, {});
    return result ?? { acknowledged: false };
  },

  getUnacknowledgedCount: async (): Promise<{ count: number }> => {
    const result = await apiClient.get<{ count: number }>('/wearable-telemetry/triggers/unacknowledged/count');
    return result ?? { count: 0 };
  },
};
