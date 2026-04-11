import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PluginCategory {
  PAYMENT = 'payment',
  ANALYTICS = 'analytics',
  MARKETING = 'marketing',
  INTEGRATION = 'integration',
  CUSTOM = 'custom',
}

@Entity('plugins')
export class Plugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 50 })
  version: string;

  @Column({ length: 100 })
  author: string;

  @Column({
    type: 'enum',
    enum: PluginCategory,
  })
  category: PluginCategory;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ default: false })
  isFree: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  downloadCount: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  icon?: string;

  @Column({ type: 'text', array: true, default: '{}' })
  screenshots?: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  capabilities?: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  dependencies?: string[]; // 依赖的其他插件ID

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    changelog?: string[];
    license?: string;
    repository?: string;
    documentation?: string;
    minAgentVersion?: string;
    maxAgentVersion?: string;
  };

  // P6.4 Plugin manifest — defines what the plugin provides
  @Column({ type: 'jsonb', nullable: true })
  manifest?: {
    commands?: Array<{ name: string; description?: string; promptTemplate: string }>;
    hooks?: Array<{ event: string; handler: string; priority?: number }>;
    mcpServers?: Array<{ name: string; transport: string; url?: string; command?: string }>;
    agents?: Array<{ name: string; model?: string; systemPrompt: string }>;
    tools?: Array<{ name: string; description: string; inputSchema: Record<string, any> }>;
    permissions?: string[];
    /** P2: Plugin-owned resources — what this plugin registers into the runtime */
    ownedTools?: Array<string | { name: string; description?: string; [key: string]: any }>;
    ownedHooks?: Array<string | { event?: string; name?: string; description?: string; [key: string]: any }>;
    ownedChannels?: Array<string | { name: string; description?: string; [key: string]: any }>;
    ownedServices?: Array<string | { name: string; description?: string; [key: string]: any }>;
    ownedMemorySlots?: Array<string | { name: string; scope?: string; description?: string; [key: string]: any }>;
    ownedProtocols?: Array<string | { name: string; protocol?: string; endpoint?: string; description?: string; [key: string]: any }>;
    ownedDoctors?: Array<string | { name: string; domain?: string; description?: string; [key: string]: any }>;
    ownedRuntimeCompat?: Array<string | { name: string; target?: string; surface?: string; description?: string; [key: string]: any }>;
  };

  // P2: Plugin-first contract — permissions and sandbox
  @Column({ type: 'text', array: true, default: '{}' })
  requiredPermissions?: string[];  // permissions the plugin needs (e.g. 'tools:read', 'memory:write', 'network:outbound')

  @Column({ type: 'varchar', length: 50, default: 'none' })
  sandboxLevel?: string;  // 'none' | 'process' | 'wasm' — isolation level

  @Column({ type: 'jsonb', nullable: true })
  securityPolicy?: {
    allowedDomains?: string[];       // network access whitelist
    maxMemoryMb?: number;            // memory limit
    maxExecutionMs?: number;         // execution time limit
    allowFileSystem?: boolean;       // filesystem access
    allowNetwork?: boolean;          // network access
  };

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

