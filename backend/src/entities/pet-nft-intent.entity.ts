import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PetNftIntent — Phase 6 M3 (V6 链上身份)
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M3
 *
 * 用户为高亲密度宠物发起 mint NFT 的"意向"（off-chain row）。
 * 真正上链由独立 signer 服务异步处理，此表只追踪状态。
 *
 *   - 1 LivingPet 同 chain 至多 1 个非 failed intent（uq）
 *   - status: pending → submitted → minted | failed | cancelled
 *   - intimacy 门槛在 service 层校验（默认 ≥ 5）
 *   - chain: 'base' | 'eth' | 'bsc' | 'sol'  （字符串，避免迁移枚举锁）
 *   - metadataUri: IPFS / Arweave URI（service 在 pending 时生成 + pin）
 */

export type PetNftIntentStatus =
  | 'pending'    // 行刚创建，metadata 还未生成
  | 'ready'      // metadata pinned, 等 signer 取
  | 'submitted'  // signer 已发送 tx
  | 'minted'     // 链上确认
  | 'failed'     // 链上 revert / 超时
  | 'cancelled'; // 用户撤销

@Entity('pet_nft_intents')
@Index(['userId'])
@Index(['livingPetId'])
@Index(['status'])
@Index(['livingPetId', 'chain'], {
  unique: true,
  where: "status NOT IN ('failed','cancelled')",
})
export class PetNftIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  livingPetId: string;

  /** 灵魂模板 slug，冗余便于查询 / 链上 metadata */
  @Column({ type: 'varchar', length: 64 })
  soulTemplateId: string;

  /** intimacy_level 快照（mint 时） */
  @Column({ type: 'smallint' })
  intimacySnapshot: number;

  @Column({ type: 'varchar', length: 16 })
  chain: 'base' | 'eth' | 'bsc' | 'sol' | string;

  /** ERC-721 contract address (lower-case hex)。可空，pending 时为空 */
  @Column({ type: 'varchar', length: 96, nullable: true })
  contractAddress: string | null;

  /** 链上 tokenId（uint256 用字符串存储） */
  @Column({ type: 'varchar', length: 96, nullable: true })
  tokenId: string | null;

  /** mint 交易 hash */
  @Column({ type: 'varchar', length: 96, nullable: true })
  txHash: string | null;

  /** 用户接收地址 */
  @Column({ type: 'varchar', length: 96 })
  recipientAddress: string;

  /** ipfs:// 或 ar:// 或 https:// — service 在 ready 状态时填写 */
  @Column({ type: 'varchar', length: 256, nullable: true })
  metadataUri: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: PetNftIntentStatus;

  /** 失败原因 */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
