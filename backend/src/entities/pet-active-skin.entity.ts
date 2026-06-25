import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PetActiveSkin — 用户当前激活的皮肤指针
 *
 * 一个 user 同一时间只激活一只皮肤，分离出此表是为了：
 *  1) 避免 LivingPet 频繁写
 *  2) 历史激活记录可追踪（updatedAt）
 *  3) 跨端切换皮肤时可幂等
 *
 * 设计：userId 为主键 → 自然 unique；activeSkinId 是 pet_skins.id 引用。
 */
@Entity('pet_active_skins')
export class PetActiveSkin {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  activeSkinId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
