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
 * OAuthToken — 一个用户对一个 OAuth 连接器(google-calendar / gmail 等)的授权令牌。
 *
 * access_token / refresh_token 经 AES-256-GCM 加密后存储(密文,见 TokenCipher),
 * 明文令牌、邮件正文、日程标题等绝不落库/落日志(R6.8)。
 * (user_id, connector_id) 唯一,重复授权幂等更新同一行(R6.2)。
 *
 * 全局 SnakeNamingStrategy:`@Column()` 不写 `name:`。
 */
@Entity('connector_oauth_tokens')
@Unique(['userId', 'connectorId'])
@Index(['userId'])
export class OAuthToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属用户。 */
  @Column({ type: 'uuid' })
  userId: string;

  /** 目录连接器 id(connector-catalog.ts),如 'google-calendar' / 'gmail'。 */
  @Column({ type: 'varchar', length: 64 })
  connectorId: string;

  /** 访问令牌密文(AES-256-GCM,格式 iv:enc:tag)。 */
  @Column({ type: 'text' })
  accessTokenEnc: string;

  /** 刷新令牌密文(可空;provider 未下发 refresh token 时为 null)。 */
  @Column({ type: 'text', nullable: true })
  refreshTokenEnc: string | null;

  /** 访问令牌过期时刻(用于临期刷新判定)。 */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** 授权范围(空格分隔的 scope 串)。 */
  @Column({ type: 'text', nullable: true })
  scope: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
