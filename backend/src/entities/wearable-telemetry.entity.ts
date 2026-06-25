import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// ── Wearable Telemetry Sample ────────────────────────────────────────────────

@Entity('wearable_telemetry_samples')
@Index('idx_wts_user_device_channel_ts', ['userId', 'deviceId', 'channel', 'sampleTimestamp'])
@Index('idx_wts_user_device_ts', ['userId', 'deviceId', 'sampleTimestamp'])
export class WearableTelemetrySample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 100 })
  deviceName: string;

  @Index()
  @Column({ length: 30 })
  channel: string;

  @Column({ type: 'double precision' })
  value: number;

  @Column({ length: 20 })
  unit: string;

  @Column({ type: 'text', nullable: true })
  rawBase64?: string;

  @Column({ length: 100, nullable: true })
  characteristicUuid?: string;

  @Column({ length: 100, nullable: true })
  serviceUuid?: string;

  @Index()
  @Column({ type: 'timestamptz' })
  sampleTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Wearable Automation Rule ─────────────────────────────────────────────────

@Entity('wearable_automation_rules')
@Index('idx_war_user_device_enabled', ['userId', 'deviceId', 'enabled'])
export class WearableAutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ default: true })
  enabled: boolean;

  @Index()
  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 30 })
  channel: string;

  @Column({ length: 20 })
  condition: string;

  @Column({ type: 'double precision' })
  threshold: number;

  @Column({ type: 'double precision', nullable: true })
  thresholdHigh?: number;

  @Column({ type: 'int', default: 0 })
  windowMs: number;

  @Column({ type: 'int', default: 300000 })
  cooldownMs: number;

  @Column({ length: 30 })
  action: string;

  @Column({ type: 'jsonb', default: {} })
  actionPayload: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  lastTriggeredAt?: Date;

  @Column({ type: 'int', default: 0 })
  triggerCount: number;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Wearable Trigger Event ───────────────────────────────────────────────────

@Entity('wearable_trigger_events')
@Index('idx_wte_user_ack_triggered', ['userId', 'acknowledged', 'triggeredAt'])
export class WearableTriggerEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  ruleId: string;

  @Column({ length: 200 })
  ruleName: string;

  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 30 })
  channel: string;

  @Column({ type: 'double precision' })
  value: number;

  @Column({ length: 20 })
  condition: string;

  @Column({ type: 'double precision' })
  threshold: number;

  @Column({ length: 30 })
  action: string;

  @Column({ type: 'jsonb', default: {} })
  actionPayload: Record<string, unknown>;

  @Column({ default: false })
  acknowledged: boolean;

  @Index()
  @Column({ type: 'timestamptz' })
  triggeredAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
