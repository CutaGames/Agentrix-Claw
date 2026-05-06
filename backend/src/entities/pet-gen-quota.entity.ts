import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetGenQuota — Phase 2 W1 配额账本（per user × month）。
 *
 * PRD: docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §5 BE-T2.1-2.5
 *
 * 设计：
 *  - period: 'YYYY-MM' 月度账期，与 (user_id, period) 唯一
 *  - included: 计划内免费额度（Free=3 / Pro=20 / Pro+=∞ 用 -1 表示）
 *  - used: 本月已成功生成次数
 *  - overage_used: 已发生的超额次数（每次 $0.5，会触发 Stripe）
 *  - reserved: 进行中（未结算）任务，consume() 占位 / refund() 释放
 */
@Entity('pet_gen_quotas')
@Index(['userId', 'period'], { unique: true })
@Index(['period'])
export class PetGenQuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** 'YYYY-MM' (UTC) — cron 每月 1 日 00:00 UTC 创建新行 */
  @Column({ type: 'varchar', length: 7 })
  period: string;

  /** 计划：'free' | 'pro' | 'pro_plus' | 'enterprise' */
  @Column({ type: 'varchar', length: 24, default: 'free' })
  plan: string;

  /** 计划内月度免费次数；-1 = 无限 */
  @Column({ type: 'integer', default: 3 })
  included: number;

  /** 本月已使用（成功） */
  @Column({ type: 'integer', default: 0 })
  used: number;

  /** 已发生的超额次数 */
  @Column({ type: 'integer', default: 0 })
  overageUsed: number;

  /** 进行中预留次数（Phase 2 用于乐观锁） */
  @Column({ type: 'integer', default: 0 })
  reserved: number;

  /** 单价 (USD) — overage 时记录，便于审计 */
  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0.5 })
  overageUnitPriceUsd: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
