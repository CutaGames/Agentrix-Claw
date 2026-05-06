import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PartnerApp — Phase 6 M5 (跨 App 宠物 / 合作伙伴 SDK)
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M5
 *
 * 第三方 App（米哈游 / 网易 / 任意合作方）注册后获得 api key，
 * 通过 SDK 调用 Agentrix REST 渲染宠物 / 记账 / 计费。
 *
 *   - billingMode='flat': 按月固定费 monthlyFlatUsd
 *   - billingMode='per_call': 每次调用 perCallUsd
 *   - monthlyCapUsd > 0: 当月成本超此值后 API 返回 429（保护合作方）
 *   - apiKeyHash: 仅存 SHA-256(api_key)，明文只在创建时返回一次
 */

export type PartnerAppStatus = 'active' | 'suspended' | 'revoked';
export type PartnerAppBillingMode = 'flat' | 'per_call';

@Entity('partner_apps')
@Index(['ownerUserId'])
@Index(['slug'], { unique: true })
@Index(['apiKeyHash'], { unique: true })
export class PartnerApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  /** url-safe slug, used in dashboards + audit logs */
  @Column({ type: 'varchar', length: 64 })
  slug: string;

  /** sha-256 hex of the issued api key */
  @Column({ type: 'varchar', length: 96 })
  apiKeyHash: string;

  /** OAuth-like redirect URIs (jsonb array) */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  redirectUris: string[];

  /**
   * Scopes — subset of:
   *   pet.read, pet.emotion.write, pet.chat,
   *   wallet.read, marketplace.read
   */
  @Column({ type: 'jsonb', default: () => "'[\"pet.read\"]'" })
  scopes: string[];

  @Column({ type: 'varchar', length: 16, default: 'per_call' })
  billingMode: PartnerAppBillingMode;

  @Column({ type: 'numeric', precision: 8, scale: 4, default: 0.001 })
  perCallUsd: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  monthlyFlatUsd: string;

  /** 0 = no cap; otherwise stop serving this app for the month at this $ */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 100 })
  monthlyCapUsd: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: PartnerAppStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
