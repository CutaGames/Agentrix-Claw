import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type AutomationRule,
  type TelemetryChannel,
  type TelemetrySample,
  type TriggerAction,
  type TriggerCondition,
  type TriggerEvent,
  type WearableAgentContext,
  type WearableKind,
  type CollectorStatus,
} from './wearableTypes';
import { WearableDataCollectorService } from './wearableDataCollector.service';

type TriggerListener = (event: TriggerEvent) => void;

const STORAGE_KEY_RULES = '@wearable_automation_rules';
const STORAGE_KEY_HISTORY = '@wearable_trigger_history';
const MAX_HISTORY = 100;

export class WearableAutomationEngineService {
  private static rules: AutomationRule[] = [];
  private static triggerHistory: TriggerEvent[] = [];
  private static triggerListeners: Set<TriggerListener> = new Set();
  private static sampleUnsub: (() => void) | null = null;
  private static latestValues: Map<string, { value: number; unit: string; updatedAt: string }> = new Map();
  private static running = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  static async initialize(): Promise<void> {
    await this.loadRules();
    await this.loadHistory();
  }

  static start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.sampleUnsub = WearableDataCollectorService.onSample((sample) => {
      this.processSample(sample);
    });
  }

  static stop(): void {
    this.running = false;
    if (this.sampleUnsub) {
      this.sampleUnsub();
      this.sampleUnsub = null;
    }
  }

  // ── Rule CRUD ──────────────────────────────────────────────────────────────

  static getRules(): AutomationRule[] {
    return [...this.rules];
  }

  static getRule(ruleId: string): AutomationRule | undefined {
    return this.rules.find((r) => r.id === ruleId);
  }

  static async addRule(rule: Omit<AutomationRule, 'id' | 'lastTriggeredAt' | 'triggerCount' | 'createdAt'>): Promise<AutomationRule> {
    const newRule: AutomationRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      lastTriggeredAt: null,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.rules.push(newRule);
    await this.persistRules();
    return newRule;
  }

  static async updateRule(ruleId: string, updates: Partial<AutomationRule>): Promise<AutomationRule | null> {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx === -1) {
      return null;
    }
    this.rules[idx] = { ...this.rules[idx], ...updates, id: ruleId };
    await this.persistRules();
    return this.rules[idx];
  }

  static async deleteRule(ruleId: string): Promise<boolean> {
    const before = this.rules.length;
    this.rules = this.rules.filter((r) => r.id !== ruleId);
    if (this.rules.length !== before) {
      await this.persistRules();
      return true;
    }
    return false;
  }

  static async toggleRule(ruleId: string): Promise<boolean> {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule) {
      return false;
    }
    rule.enabled = !rule.enabled;
    await this.persistRules();
    return rule.enabled;
  }

  // ── Trigger History ────────────────────────────────────────────────────────

  static getHistory(limit = 50): TriggerEvent[] {
    return this.triggerHistory.slice(0, limit);
  }

  static async clearHistory(): Promise<void> {
    this.triggerHistory = [];
    await this.persistHistory();
  }

  static async acknowledgeEvent(eventId: string): Promise<void> {
    const ev = this.triggerHistory.find((e) => e.id === eventId);
    if (ev) {
      ev.acknowledged = true;
      await this.persistHistory();
    }
  }

  static getUnacknowledgedCount(): number {
    return this.triggerHistory.filter((e) => !e.acknowledged).length;
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  static onTrigger(listener: TriggerListener): () => void {
    this.triggerListeners.add(listener);
    return () => { this.triggerListeners.delete(listener); };
  }

  // ── Agent Context ──────────────────────────────────────────────────────────

  static buildAgentContext(
    deviceId: string,
    deviceName: string,
    kind: WearableKind,
    collectorStatus: CollectorStatus,
  ): WearableAgentContext {
    const latestReadings: Record<string, { value: number; unit: string; updatedAt: string }> = {};
    for (const [key, val] of this.latestValues.entries()) {
      if (key.startsWith(`${deviceId}:`)) {
        const channel = key.split(':')[1];
        latestReadings[channel] = val;
      }
    }

    const activeTriggers = this.triggerHistory.filter(
      (e) => e.deviceId === deviceId && !e.acknowledged,
    );

    return {
      deviceId,
      deviceName,
      kind,
      latestReadings: latestReadings as WearableAgentContext['latestReadings'],
      activeTriggers,
      collectorStatus,
    };
  }

  // ── Rule Templates ─────────────────────────────────────────────────────────

  static getTemplates(): Array<{ name: string; description: string; rule: Omit<AutomationRule, 'id' | 'lastTriggeredAt' | 'triggerCount' | 'createdAt' | 'deviceId'> }> {
    return [
      {
        name: 'High Heart Rate Alert',
        description: 'Trigger when heart rate exceeds 120 bpm for sustained period',
        rule: {
          name: 'High Heart Rate Alert',
          enabled: true,
          channel: 'heart_rate',
          condition: 'gt',
          threshold: 120,
          windowMs: 30_000,
          cooldownMs: 300_000,
          action: 'notify_agent',
          actionPayload: { severity: 'warning', message: 'Heart rate elevated above 120 bpm' },
        },
      },
      {
        name: 'Low Heart Rate Alert',
        description: 'Trigger when heart rate drops below 50 bpm',
        rule: {
          name: 'Low Heart Rate Alert',
          enabled: true,
          channel: 'heart_rate',
          condition: 'lt',
          threshold: 50,
          windowMs: 60_000,
          cooldownMs: 300_000,
          action: 'notify_agent',
          actionPayload: { severity: 'warning', message: 'Heart rate dropped below 50 bpm' },
        },
      },
      {
        name: 'Low Battery Warning',
        description: 'Alert when wearable battery drops below 20%',
        rule: {
          name: 'Low Battery Warning',
          enabled: true,
          channel: 'battery',
          condition: 'lt',
          threshold: 20,
          windowMs: 0,
          cooldownMs: 3_600_000,
          action: 'send_alert',
          actionPayload: { severity: 'info', message: 'Wearable battery is low' },
        },
      },
      {
        name: 'Temperature Fever Detection',
        description: 'Trigger when body temperature exceeds 37.5°C',
        rule: {
          name: 'Temperature Fever Detection',
          enabled: true,
          channel: 'temperature',
          condition: 'gt',
          threshold: 37.5,
          windowMs: 60_000,
          cooldownMs: 600_000,
          action: 'notify_agent',
          actionPayload: { severity: 'alert', message: 'Elevated body temperature detected' },
        },
      },
      {
        name: 'Step Goal Reached',
        description: 'Notify agent when daily step count exceeds 10,000',
        rule: {
          name: 'Step Goal Reached',
          enabled: true,
          channel: 'steps',
          condition: 'gt',
          threshold: 10000,
          windowMs: 0,
          cooldownMs: 86_400_000,
          action: 'log_event',
          actionPayload: { severity: 'info', message: 'Daily step goal reached!' },
        },
      },
      {
        name: 'Device Disconnected',
        description: 'Alert when no data received for 5 minutes',
        rule: {
          name: 'Device Disconnected',
          enabled: true,
          channel: 'heart_rate',
          condition: 'absent',
          threshold: 0,
          windowMs: 300_000,
          cooldownMs: 600_000,
          action: 'send_alert',
          actionPayload: { severity: 'warning', message: 'Wearable device may be disconnected' },
        },
      },
    ];
  }

  // ── Sample Processing ──────────────────────────────────────────────────────

  private static processSample(sample: TelemetrySample): void {
    const key = `${sample.deviceId}:${sample.channel}`;
    this.latestValues.set(key, {
      value: sample.value,
      unit: sample.unit,
      updatedAt: sample.timestamp,
    });

    const matchingRules = this.rules.filter(
      (r) => r.enabled && r.deviceId === sample.deviceId && r.channel === sample.channel,
    );

    for (const rule of matchingRules) {
      if (this.isInCooldown(rule)) {
        continue;
      }
      if (this.evaluateCondition(rule.condition, sample.value, rule.threshold, rule.thresholdHigh)) {
        this.fireTrigger(rule, sample);
      }
    }
  }

  private static evaluateCondition(
    condition: TriggerCondition,
    value: number,
    threshold: number,
    thresholdHigh?: number,
  ): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      case 'between': return thresholdHigh != null && value >= threshold && value <= thresholdHigh;
      case 'change': return true; // fires on any new value
      case 'absent': return false; // handled by absence timer, not value comparison
      default: return false;
    }
  }

  private static isInCooldown(rule: AutomationRule): boolean {
    if (!rule.lastTriggeredAt || rule.cooldownMs <= 0) {
      return false;
    }
    const elapsed = Date.now() - new Date(rule.lastTriggeredAt).getTime();
    return elapsed < rule.cooldownMs;
  }

  private static fireTrigger(rule: AutomationRule, sample: TelemetrySample): void {
    const now = new Date().toISOString();

    rule.lastTriggeredAt = now;
    rule.triggerCount += 1;

    const event: TriggerEvent = {
      id: `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      deviceId: sample.deviceId,
      channel: sample.channel,
      value: sample.value,
      condition: rule.condition,
      threshold: rule.threshold,
      action: rule.action,
      actionPayload: rule.actionPayload,
      triggeredAt: now,
      acknowledged: false,
    };

    this.triggerHistory.unshift(event);
    if (this.triggerHistory.length > MAX_HISTORY) {
      this.triggerHistory = this.triggerHistory.slice(0, MAX_HISTORY);
    }

    for (const listener of this.triggerListeners) {
      try { listener(event); } catch { /* noop */ }
    }

    this.persistRules();
    this.persistHistory();
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private static async loadRules(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_RULES);
      if (raw) {
        this.rules = JSON.parse(raw);
      }
    } catch {
      this.rules = [];
    }
  }

  private static async persistRules(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(this.rules));
    } catch { /* noop */ }
  }

  private static async loadHistory(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_HISTORY);
      if (raw) {
        this.triggerHistory = JSON.parse(raw);
      }
    } catch {
      this.triggerHistory = [];
    }
  }

  private static async persistHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(this.triggerHistory));
    } catch { /* noop */ }
  }
}
