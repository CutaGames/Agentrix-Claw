import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonOrg — 组织/虚拟公司(Task 3.4 / R6)。
 *
 * "组织(Org)"原语的长期实例。虚拟公司 = kind:'company';活动主办方(future)= kind:'event'。
 * 账本权威余额 = aeon_ledger_entries 按 org 求和;`axpLedgerBalance` 仅缓存(R11.2)。
 *
 * 遵循 SnakeNamingStrategy:`@Column()` 不写 `name:`。
 */
@Entity('aeon_orgs')
@Index(['ownerUserId'])
export class AeonOrg {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 创始人/拥有者。 */
  @Column({ type: 'uuid' })
  ownerUserId: string;

  /** 公司名。 */
  @Column({ type: 'varchar', length: 64 })
  name: string;

  /** 类型:company(长期公司)/ event(临时活动,future)。 */
  @Column({ type: 'varchar', length: 16, default: 'company' })
  kind: string;

  /** 所属纪元。 */
  @Column({ type: 'varchar', length: 16, default: 'earth' })
  epoch: string;

  /** 公司房间(FK → aeon_rooms.id)。 */
  @Column({ type: 'uuid', nullable: true })
  roomId: string | null;

  /** 账本缓存余额(AXP);权威以分录求和为准。 */
  @Column({ type: 'bigint', default: 0 })
  axpLedgerBalance: string;

  /** 对外门面配置(接单页/招聘页)。 */
  @Column({ type: 'jsonb', nullable: true })
  storefront: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
