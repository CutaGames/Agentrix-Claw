import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * UserConnector — 用户已安装的连接器(插件库一键装的结果)。
 *
 * 记录用户装了目录里哪个连接器、鉴权凭据(MVP 明文 jsonb;生产应走密钥保管箱)、
 * 以及安装后产生的底层资源 id(openapi 导入的 skillId / mcp 注册的 mcpServerId)。
 * (user_id, connector_id) 唯一,重复安装幂等更新。
 *
 * 全局 SnakeNamingStrategy:`@Column()` 不写 `name:`。
 */
@Entity('user_connectors')
@Unique(['userId', 'connectorId'])
@Index(['userId'])
export class UserConnector {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** 目录连接器 id(connector-catalog.ts)。 */
  @Column({ type: 'varchar', length: 64 })
  connectorId: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /**
   * 鉴权凭据(MVP 明文)。形如 { apiKey, headerName?, token? }。
   * 生产应加密 / 走保管箱;此处先满足端到端可用。
   */
  @Column({ type: 'jsonb', nullable: true })
  credentials: Record<string, unknown> | null;

  /** openapi 类安装后导入的 skill id(可空)。 */
  @Column({ type: 'uuid', nullable: true })
  importedSkillId: string | null;

  /** mcp 类安装后注册的 mcp server id(可空)。 */
  @Column({ type: 'uuid', nullable: true })
  mcpServerId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
