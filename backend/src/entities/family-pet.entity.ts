import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('family_pets')
@Index(['familyId'], { unique: true })
export class FamilyPetEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  familyId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 16 })
  emotion: string;

  @Column({ type: 'integer' })
  intimacyLevel: number;

  @Column({ type: 'jsonb' })
  sharedAmongMembers: string[];

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint' })
  updatedAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
