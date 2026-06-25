import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * MPC 钱包实体
 * 存储商户 MPC 钱包信息（不存储私钥分片）
 */
@Entity('mpc_wallets')
@Index(['merchantId'])
@Index(['walletAddress'])
export class MPCWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  merchantId: string; // 商户ID

  @Column({ type: 'varchar', length: 255, unique: true })
  walletAddress: string; // MPC 钱包地址

  @Column({ type: 'varchar', length: 50, default: 'BSC' })
  chain: string; // 链类型（BSC, Ethereum, etc.）

  @Column({ type: 'varchar', length: 50, default: 'USDC' })
  currency: string; // 币种（USDC, USDT, etc.）

  @Column({ type: 'text', nullable: true })
  encryptedShardB: string; // 加密的分片 B（Agentrix 持有）

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // 是否激活

  @Column({ type: 'boolean', default: false })
  autoSplitAuthorized: boolean; // 是否授权自动分账（使用分片 B+C）

  @Column({ type: 'bigint', nullable: true })
  autoSplitMaxAmount: string; // 自动分账最大金额（USDC，6 decimals）

  @Column({ type: 'timestamp', nullable: true })
  autoSplitExpiresAt: Date; // 自动分账授权过期时间

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // 元数据
}

