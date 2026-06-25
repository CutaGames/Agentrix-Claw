import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { NFTCollection } from './nft-collection.entity';

export enum NFTStatus {
  MINTING = 'minting',
  MINTED = 'minted',
  LISTED = 'listed',
  SOLD = 'sold',
  FAILED = 'failed',
}

@Entity('nfts')
@Index(['collectionId', 'tokenId'])
@Index(['contractAddress', 'tokenId'])
@Index(['owner', 'status'])
export class NFT {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  collectionId: string;

  @ManyToOne(() => NFTCollection, (collection) => collection.nfts)
  @JoinColumn({ name: 'collectionId' })
  collection: NFTCollection;

  @Column({ nullable: true })
  tokenId: string; // 链上 token ID

  @Column({ nullable: true })
  contractAddress: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ nullable: true })
  image: string; // NFT 图片 URL

  @Column('jsonb', { nullable: true })
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;

  @Column({
    type: 'enum',
    enum: NFTStatus,
    default: NFTStatus.MINTING,
  })
  status: NFTStatus;

  @Column({ nullable: true })
  metadataURI: string; // IPFS 或 Arweave URI

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  price: string; // 当前价格

  @Column({ nullable: true, default: 'USDC' })
  currency: string;

  @Column({ nullable: true })
  owner: string; // 当前所有者地址

  @Column({ nullable: true })
  creator: string; // 创建者地址

  @Column({ nullable: true })
  transactionHash: string; // Mint 交易哈希

  @Column({ nullable: true })
  productId: string; // 关联到 Product 表

  @Column('uuid', { nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  // 销售历史
  @Column('jsonb', { nullable: true })
  salesHistory: Array<{
    buyer: string;
    price: string;
    currency: string;
    timestamp: Date;
    transactionHash: string;
  }>;

  // 元数据
  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

