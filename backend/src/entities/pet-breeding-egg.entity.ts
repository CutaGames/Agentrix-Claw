import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Pet Phase 6 S5 — 繁育蛋（5 天孵化）
 *
 * 双方各扣 200 credits（在 invite 时校验，本地 mock 跳过）；
 * 孵化期满后调用 marketplace-pet/remix-breeding 生成混合外观。
 */
@Entity({ name: 'pet_breeding_eggs' })
@Index(['initiatorUserId', 'status'])
@Index(['partnerUserId', 'status'])
export class PetBreedingEgg {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  initiatorUserId!: string;

  @Column('uuid')
  partnerUserId!: string;

  @Column({ type: 'varchar', length: 64 })
  initiatorPetSkinId!: string;

  @Column({ type: 'varchar', length: 64 })
  partnerPetSkinId!: string;

  /** invited | accepted | hatching | hatched | declined | cancelled */
  @Column({ type: 'varchar', length: 16, default: 'invited' })
  status!: string;

  /** 孵化结束时间（unix ms 字符串，5 天后） */
  @Column({ type: 'bigint', nullable: true })
  hatchAt!: string | null;

  /** 孵化产物 skin id（双方各得 1 只）*/
  @Column({ type: 'uuid', nullable: true })
  childSkinIdInitiator!: string | null;

  @Column({ type: 'uuid', nullable: true })
  childSkinIdPartner!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
