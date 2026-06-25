import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonOrgMember — 组织成员(Task 3.4 / 3.7 / R6 / R8)。
 *
 * role:
 *   - owner:创始人(人)
 *   - human_member:加入的人类成员(升级路径 OPC→团队→企业,R6.7)
 *   - agent_employee:agent 员工(自己的或雇来的)。`agentInstanceId` 复用现有
 *     openclaw_instances.id,不新建 agent 概念。
 *
 * 雇佣别人 agent 时:`memberUserId` = 员工 owner,org.ownerUserId = 雇主(R6.8)。
 *
 * 遵循 SnakeNamingStrategy:`@Column()` 不写 `name:`。
 */
@Entity('aeon_org_members')
@Index(['orgId'])
@Index(['memberUserId'])
export class AeonOrgMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  /** 成员归属用户(雇主自己或被雇 agent 的 owner)。 */
  @Column({ type: 'uuid' })
  memberUserId: string;

  /** agent 员工对应的 OpenClaw 实例;human 成员为 null。 */
  @Column({ type: 'uuid', nullable: true })
  agentInstanceId: string | null;

  /** owner / human_member / agent_employee。 */
  @Column({ type: 'varchar', length: 24, default: 'agent_employee' })
  role: string;

  /** 打卡排班(时段)。 */
  @Column({ type: 'jsonb', nullable: true })
  schedule: Record<string, unknown> | null;

  /** 每工作周期 AXP 工资(agent 员工)。 */
  @Column({ type: 'int', default: 0 })
  wageAxpPerPeriod: number;

  /** active / paused / withdrawn。 */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
