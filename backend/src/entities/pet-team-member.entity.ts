import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PetTeamMember — Phase 6 M2 (V6 Multi-Pet)
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M2
 *
 * 模型：1 主宠（user 的 LivingPet） + 最多 11 子宠（对应 11 Agent）。
 * 子宠不是独立 LivingPet 行；它是主宠下的"团队成员"，引用一个 soul template
 * 作为人格、独立 budget / scope / wallet。
 *
 *   - parentLivingPetId  → living_pets.id（主宠）
 *   - userId             → 冗余，便于 SQL 查询
 *   - role               → 11 Agent 之一（codename，无 @ 前缀）
 *   - soulTemplateId     → pet_soul_templates.id
 *   - scope              → 工具白名单 / 风险等级 / 区域
 *   - dailyBudgetUsd     → 子宠独立预算
 *   - walletAddress      → 子宠独立钱包（可选；为空时走主宠）
 *   - status             → active / paused / revoked
 *
 * 唯一约束：(parentLivingPetId, role)。一个主宠下每个 role 只能 1 个子宠。
 */

export type PetTeamRole =
  | 'ceo' | 'dev' | 'qa_ops' | 'growth' | 'ops'
  | 'media' | 'ecosystem' | 'community' | 'brand'
  | 'hunter' | 'treasury';

export type PetTeamMemberStatus = 'active' | 'paused' | 'revoked';

@Entity('pet_team_members')
@Index(['parentLivingPetId', 'role'], { unique: true })
@Index(['userId'])
@Index(['status'])
export class PetTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  parentLivingPetId: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** 11 Agent 之一 */
  @Column({ type: 'varchar', length: 32 })
  role: PetTeamRole;

  /** 灵魂模板 slug（pet_soul_templates.id） */
  @Column({ type: 'varchar', length: 64 })
  soulTemplateId: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  displayName: string;

  /**
   * 工具白名单 + 风险等级 + 区域。结构示例：
   * {
   *   tools: ['shell', 'web_search'],
   *   maxApprovalLevel: 'L1',
   *   regions: ['cn', 'sg'],
   * }
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  scope: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0.5 })
  dailyBudgetUsd: string;

  /** 子宠独立钱包；为空 → 走主宠钱包 */
  @Column({ type: 'varchar', length: 96, nullable: true })
  walletAddress: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: PetTeamMemberStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
