import { Buffer } from 'buffer';
import { WearableBleGatewayService } from './wearableBleGateway.service';
import {
  type CollectorConfig,
  type CollectorState,
  type CollectorStatus,
  type MonitoredChannel,
  type TelemetryBuffer,
  type TelemetrySample,
  type TelemetryUploadPayload,
} from './wearableTypes';

type StateListener = (state: CollectorState) => void;
type SampleListener = (sample: TelemetrySample) => void;

const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DEFAULT_MAX_BUFFER_SIZE = 200;
const DEFAULT_RECONNECT_MAX = 5;
const DEFAULT_RECONNECT_DELAY_MS = 3_000;

export class WearableDataCollectorService {
  private static config: CollectorConfig | null = null;
  private static state: CollectorState | null = null;
  private static buffer: TelemetryBuffer | null = null;
  private static monitorSubscriptions: Array<() => void> = [];
  private static flushTimer: ReturnType<typeof setInterval> | null = null;
  private static reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static stateListeners: Set<StateListener> = new Set();
  private static sampleListeners: Set<SampleListener> = new Set();
  private static uploadFn: ((payload: TelemetryUploadPayload) => Promise<void>) | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  static configure(
    config: CollectorConfig,
    uploadFn: (payload: TelemetryUploadPayload) => Promise<void>,
  ): void {
    this.config = {
      ...config,
      flushIntervalMs: config.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS,
      maxBufferSize: config.maxBufferSize || DEFAULT_MAX_BUFFER_SIZE,
      reconnectMaxAttempts: config.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX,
      reconnectDelayMs: config.reconnectDelayMs || DEFAULT_RECONNECT_DELAY_MS,
    };
    this.uploadFn = uploadFn;
    this.initState();
  }

  static async start(): Promise<void> {
    if (!this.config) {
      throw new Error('Collector not configured. Call configure() first.');
    }
    if (this.state?.status === 'collecting') {
      return;
    }

    this.updateStatus('connecting');

    try {
      await WearableBleGatewayService.ensurePoweredOn();
      await this.subscribeChannels();
      this.startFlushTimer();
      this.updateStatus('collecting');
    } catch (err: any) {
      this.updateState({ lastError: err.message || 'Failed to start collector' });
      this.updateStatus('error');
      this.scheduleReconnect();
    }
  }

  static stop(): void {
    this.teardownSubscriptions();
    this.stopFlushTimer();
    this.clearReconnectTimer();
    this.flushBuffer();
    this.updateStatus('idle');
  }

  static pause(): void {
    this.teardownSubscriptions();
    this.stopFlushTimer();
    this.updateStatus('paused');
  }

  static async resume(): Promise<void> {
    if (this.state?.status !== 'paused') {
      return;
    }
    await this.start();
  }

  static destroy(): void {
    this.stop();
    this.config = null;
    this.state = null;
    this.buffer = null;
    this.stateListeners.clear();
    this.sampleListeners.clear();
    this.uploadFn = null;
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  static onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    if (this.state) {
      listener(this.state);
    }
    return () => { this.stateListeners.delete(listener); };
  }

  static onSample(listener: SampleListener): () => void {
    this.sampleListeners.add(listener);
    return () => { this.sampleListeners.delete(listener); };
  }

  static getState(): CollectorState | null {
    return this.state ? { ...this.state } : null;
  }

  static getBufferSize(): number {
    return this.buffer?.samples.length ?? 0;
  }

  // ── Channel Subscription ───────────────────────────────────────────────────

  private static async subscribeChannels(): Promise<void> {
    if (!this.config) {
      return;
    }

    this.teardownSubscriptions();

    const enabledChannels = this.config.channels.filter((ch) => ch.enabled);
    for (const channel of enabledChannels) {
      const unsub = WearableBleGatewayService.monitorCharacteristic(
        this.config.deviceId,
        channel.serviceUuid,
        channel.characteristicUuid,
        (event) => this.handleRawEvent(channel, event.value),
        (error) => this.handleChannelError(channel, error),
      );
      this.monitorSubscriptions.push(unsub);
    }
  }

  private static handleRawEvent(channel: MonitoredChannel, rawBase64: string | null): void {
    if (!this.config || !this.buffer) {
      return;
    }

    const parsed = this.parseValue(channel.parser, rawBase64);
    const now = new Date().toISOString();

    const sample: TelemetrySample = {
      id: `${this.config.deviceId}:${channel.channel}:${Date.now()}`,
      deviceId: this.config.deviceId,
      channel: channel.channel,
      value: parsed.value,
      unit: parsed.unit,
      rawBase64,
      characteristicUuid: channel.characteristicUuid,
      serviceUuid: channel.serviceUuid,
      timestamp: now,
    };

    channel.lastValue = parsed.value;
    channel.lastUpdatedAt = now;

    this.buffer.samples.push(sample);
    if (this.state) {
      this.state.samplesCollected += 1;
      this.state.lastSampleAt = now;
    }

    for (const listener of this.sampleListeners) {
      try { listener(sample); } catch { /* noop */ }
    }

    if (this.buffer.samples.length >= (this.config.maxBufferSize || DEFAULT_MAX_BUFFER_SIZE)) {
      this.flushBuffer();
    }

    this.emitState();
  }

  private static handleChannelError(_channel: MonitoredChannel, error: Error): void {
    if (this.state) {
      this.state.lastError = `${_channel.label}: ${error.message}`;
    }
    this.emitState();

    if (this.monitorSubscriptions.length === 0) {
      this.updateStatus('error');
      this.scheduleReconnect();
    }
  }

  // ── Value Parsing ──────────────────────────────────────────────────────────

  static parseValue(
    parser: MonitoredChannel['parser'],
    rawBase64: string | null,
  ): { value: number; unit: string } {
    if (!rawBase64) {
      return { value: 0, unit: '' };
    }

    try {
      const buf = Buffer.from(rawBase64, 'base64');

      switch (parser) {
        case 'heart_rate_measurement': {
          const flags = buf[0];
          const is16Bit = (flags & 0x01) !== 0;
          const hr = is16Bit ? buf.readUInt16LE(1) : buf[1];
          return { value: hr ?? 0, unit: 'bpm' };
        }
        case 'battery_level': {
          return { value: buf[0] ?? 0, unit: '%' };
        }
        case 'temperature': {
          const mantissa = (buf[1] ?? 0) | ((buf[2] ?? 0) << 8) | ((buf[3] ?? 0) << 16);
          const exponent = (buf.length >= 4 ? buf.readInt8(3) : 0) >> 4;
          return { value: mantissa * Math.pow(10, exponent), unit: '°C' };
        }
        case 'uint16_le': {
          return { value: buf.length >= 2 ? buf.readUInt16LE(0) : (buf[0] ?? 0), unit: '' };
        }
        case 'float32_le': {
          return { value: buf.length >= 4 ? buf.readFloatLE(0) : 0, unit: '' };
        }
        case 'raw':
        default: {
          return { value: buf[0] ?? 0, unit: 'raw' };
        }
      }
    } catch {
      return { value: 0, unit: 'error' };
    }
  }

  // ── Buffer Flush ───────────────────────────────────────────────────────────

  private static async flushBuffer(): Promise<void> {
    if (!this.buffer || this.buffer.samples.length === 0 || !this.config || !this.uploadFn) {
      return;
    }

    const samples = [...this.buffer.samples];
    this.buffer.samples = [];
    this.buffer.lastFlushedAt = new Date().toISOString();

    try {
      await this.uploadFn({
        deviceId: this.config.deviceId,
        deviceName: this.config.deviceName,
        samples,
        uploadedAt: new Date().toISOString(),
      });

      if (this.state) {
        this.state.samplesUploaded += samples.length;
      }
      this.emitState();
    } catch (err: any) {
      // Re-queue failed samples at front of buffer
      if (this.buffer) {
        this.buffer.samples = [...samples, ...this.buffer.samples];
      }
      if (this.state) {
        this.state.lastError = `Upload failed: ${err.message}`;
      }
      this.emitState();
    }
  }

  // ── Reconnection ───────────────────────────────────────────────────────────

  private static scheduleReconnect(): void {
    if (!this.config || !this.state) {
      return;
    }

    if (this.state.reconnectAttempts >= (this.config.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX)) {
      this.state.lastError = `Max reconnect attempts (${this.config.reconnectMaxAttempts}) reached.`;
      this.updateStatus('error');
      this.emitState();
      return;
    }

    this.clearReconnectTimer();
    this.updateStatus('reconnecting');

    const delay = (this.config.reconnectDelayMs || DEFAULT_RECONNECT_DELAY_MS) *
      Math.pow(2, this.state.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      if (!this.state || !this.config) {
        return;
      }
      this.state.reconnectAttempts += 1;

      try {
        const isConnected = await WearableBleGatewayService.ensurePoweredOn()
          .then(() => true)
          .catch(() => false);

        if (!isConnected) {
          this.scheduleReconnect();
          return;
        }

        await this.subscribeChannels();
        this.startFlushTimer();
        this.state.reconnectAttempts = 0;
        this.state.connectedSince = new Date().toISOString();
        this.updateStatus('collecting');
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ── Timers & Cleanup ───────────────────────────────────────────────────────

  private static startFlushTimer(): void {
    this.stopFlushTimer();
    const interval = this.config?.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;
    this.flushTimer = setInterval(() => this.flushBuffer(), interval);
  }

  private static stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private static clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private static teardownSubscriptions(): void {
    for (const unsub of this.monitorSubscriptions) {
      try { unsub(); } catch { /* noop */ }
    }
    this.monitorSubscriptions = [];
  }

  // ── State Management ───────────────────────────────────────────────────────

  private static initState(): void {
    if (!this.config) {
      return;
    }
    this.state = {
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName,
      status: 'idle',
      channels: this.config.channels.map((ch) => ({ ...ch })),
      samplesCollected: 0,
      samplesUploaded: 0,
      lastSampleAt: null,
      lastError: null,
      connectedSince: null,
      reconnectAttempts: 0,
    };
    this.buffer = {
      deviceId: this.config.deviceId,
      samples: [],
      startedAt: new Date().toISOString(),
      lastFlushedAt: null,
    };
  }

  private static updateStatus(status: CollectorStatus): void {
    if (this.state) {
      this.state.status = status;
      if (status === 'collecting') {
        this.state.connectedSince = new Date().toISOString();
      }
    }
    this.emitState();
  }

  private static updateState(partial: Partial<CollectorState>): void {
    if (this.state) {
      Object.assign(this.state, partial);
    }
    this.emitState();
  }

  private static emitState(): void {
    if (!this.state) {
      return;
    }
    const snapshot = { ...this.state, channels: this.state.channels.map((ch) => ({ ...ch })) };
    for (const listener of this.stateListeners) {
      try { listener(snapshot); } catch { /* noop */ }
    }
  }
}
