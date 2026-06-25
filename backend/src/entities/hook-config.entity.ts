import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum HookEventType {
  // ── Original 9 types ──
  PRE_TOOL_USE = 'pre_tool_use',
  POST_TOOL_USE = 'post_tool_use',
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  PLAN_ACCEPT = 'plan_accept',
  PLAN_REJECT = 'plan_reject',
  MEMORY_SAVE = 'memory_save',
  MESSAGE_PRE = 'message_pre',
  MESSAGE_POST = 'message_post',

  // ── P0.5 Expansion: OpenClaw-aligned hook types ──
  BEFORE_MODEL_RESOLVE = 'before_model_resolve',
  BEFORE_PROMPT_BUILD = 'before_prompt_build',
  BEFORE_COMPACTION = 'before_compaction',
  AFTER_COMPACTION = 'after_compaction',
  BEFORE_INSTALL = 'before_install',
  AFTER_INSTALL = 'after_install',
  TOOL_RESULT_PERSIST = 'tool_result_persist',
  GATEWAY_START = 'gateway_start',
  GATEWAY_STOP = 'gateway_stop',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_SENDING = 'message_sending',
  MESSAGE_SENT = 'message_sent',
}

export enum HookHandlerType {
  WEBHOOK = 'webhook',
  INTERNAL = 'internal',
  SCRIPT = 'script',
}

@Entity('hook_configs')
@Index(['userId', 'eventType'])
export class HookConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: HookEventType })
  eventType: HookEventType;

  @Column({ type: 'enum', enum: HookHandlerType, default: HookHandlerType.WEBHOOK })
  handlerType: HookHandlerType;

  @Column({ type: 'text' })
  handler: string; // URL for webhook, function name for internal, script content for script

  @Column({ type: 'int', default: 0 })
  priority: number; // lower = runs first

  @Column({ type: 'jsonb', nullable: true })
  filter?: {
    toolNames?: string[];       // only trigger for specific tools (pre/post_tool_use)
    sessionIds?: string[];      // only trigger for specific sessions
    models?: string[];           // only trigger for specific models
  };

  @Column({ type: 'jsonb', nullable: true })
  config?: {
    timeout?: number;            // ms, default 5000
    retries?: number;            // default 0
    headers?: Record<string, string>; // extra headers for webhook
    secret?: string;             // HMAC signing secret for webhook
  };

  @Column({ default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
