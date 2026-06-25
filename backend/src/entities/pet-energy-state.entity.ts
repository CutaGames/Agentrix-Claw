import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PetEnergy — per-(user, pet) energy state for Auto-Earn gating.
 *
 * PRD: docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §6.1 BE-T4.6 / Exit Gate #4
 *  - Each pet starts at energy=100 (max=100).
 *  - Energy regenerates at +10 / hour (linear, computed lazily on read).
 *  - Each Auto-Earn task consumes a configurable amount.
 *  - When energy reaches 0, new tasks are rejected.
 *
 * Schema is keyed by (userId, petSkinId) so a single user can have multiple
 * pets, each with its own energy budget.
 */
@Entity('pet_energy_states')
export class PetEnergyState {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @PrimaryColumn({ type: 'uuid' })
  petSkinId: string;

  /** Current energy 0..100 at lastUpdatedAt (caller must regen on read). */
  @Column({ type: 'integer', default: 100 })
  energy: number;

  /** Daily LLM call counter (rolling window, reset by scheduler at UTC midnight). */
  @Column({ type: 'integer', default: 0 })
  dailyLlmCalls: number;

  /** Daily USD cents spent today (for budget gate). */
  @Column({ type: 'integer', default: 0 })
  dailySpendCents: number;

  /** Optional pause flag — set by risk control when 1h LLM rate threshold hit. */
  @Column({ type: 'boolean', default: false })
  paused: boolean;

  /** Reason for pause (audit). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  pausedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
