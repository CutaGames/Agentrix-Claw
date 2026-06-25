import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PetSovereignProfile — Phase 6 M6 (主权宠物 / sovereign pet)
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M6
 *
 *   - custodyMode='platform': legacy, Agentrix 全权托管钱包
 *   - custodyMode='mpc':      1+1+1 MPC（user shard / device shard / server shard）
 *   - custodyMode='self':     用户自托管（仅记 watch-only 公钥）
 *
 *   - memoryStorage='platform' | 'ipfs' | 'arweave'
 *   - 链上记忆 URI（cid 或 Arweave tx id）由 service 在用户请求时落盘
 *   - supportedChains: 用户允许该 sovereign profile 跨链的链白名单
 *
 * 1 LivingPet 至多 1 个 sovereign profile（unique on livingPetId）。
 */

export type PetCustodyMode = 'platform' | 'mpc' | 'self';
export type PetMemoryStorage = 'platform' | 'ipfs' | 'arweave';
export type PetSovereignStatus = 'active' | 'paused' | 'revoked';

@Entity('pet_sovereign_profiles')
@Index(['livingPetId'], { unique: true })
@Index(['userId'])
@Index(['status'])
export class PetSovereignProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  livingPetId: string;

  @Column({ type: 'varchar', length: 16, default: 'platform' })
  custodyMode: PetCustodyMode;

  /** Hex pubkey or commitment for user shard (MPC) — never the secret share itself. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  mpcUserShareCommitment: string | null;

  /** Device fingerprint that holds device shard (e.g. browser/desktop install id). */
  @Column({ type: 'varchar', length: 256, nullable: true })
  mpcDeviceFingerprint: string | null;

  /** KMS key id for the server-side shard. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  mpcServerKmsKeyId: string | null;

  /** Public address aggregated from the 3 shards (display only). */
  @Column({ type: 'varchar', length: 96, nullable: true })
  walletAddress: string | null;

  @Column({ type: 'varchar', length: 16, default: 'platform' })
  memoryStorage: PetMemoryStorage;

  /** ipfs://CID or ar://txid — null while still on platform storage. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  memoryUri: string | null;

  /** Hash of the snapshot pinned at memoryUri (sha-256 hex) for tamper detection. */
  @Column({ type: 'varchar', length: 96, nullable: true })
  memoryHash: string | null;

  /** Subset of {'ethereum','base','bsc','solana'} */
  @Column({ type: 'jsonb', default: () => "'[\"base\"]'" })
  supportedChains: string[];

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: PetSovereignStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
