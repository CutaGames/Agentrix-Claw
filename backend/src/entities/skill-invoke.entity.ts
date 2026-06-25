import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('skill_invokes')
@Index(['skillId', 'tsMs'])
@Index(['invokerUserId', 'tsMs'])
export class SkillInvokeEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  skillId: string;

  @Column({ type: 'uuid' })
  invokerUserId: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ type: 'integer' })
  developerShareCents: number;

  @Column({ type: 'integer' })
  platformShareCents: number;

  @Column({ type: 'bigint' })
  tsMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
