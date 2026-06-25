import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { NFT } from './nft.entity';

export enum NFTCollectionStatus {
  DRAFT = 'draft',
  DEPLOYING = 'deploying',
  DEPLOYED = 'deployed',
  FAILED = 'failed',
}

export enum NFTChain {
  ETHEREUM = 'ethereum',
  SOLANA = 'solana',
  BSC = 'bsc',
  POLYGON = 'polygon',
  BASE = 'base',
}

export enum NFTStandard {
  ERC721 = 'ERC-721',
  ERC1155 = 'ERC-1155',
  SPL_NFT = 'SPL-NFT',
}

@Entity('nft_collections')
@Index(['userId', 'status'])
@Index(['contractAddress', 'chain'])
export class NFTCollection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: NFTChain,
  })
  chain: NFTChain;

  @Column({
    type: 'enum',
    enum: NFTStandard,
  })
  standard: NFTStandard;

  @Column({
    type: 'enum',
    enum: NFTCollectionStatus,
    default: NFTCollectionStatus.DRAFT,
  })
  status: NFTCollectionStatus;

  @Column({ nullable: true })
  contractAddress: string;

  @Column({ nullable: true })
  transactionHash: string;

  @Column('decimal', { precision: 5, scale: 4, default: 0 })
  royalty: number; // 版税比例，例如 0.05 表示 5%

  @Column('jsonb', { nullable: true })
  royaltyRecipients: Array<{
    address: string;
    percentage: number;
  }>;

  @Column({ nullable: true })
  image: string; // 集合封面图

  @Column('uuid', { nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => NFT, (nft) => nft.collection)
  nfts: NFT[];

  // 统计数据
  @Column('jsonb', { nullable: true })
  stats: {
    totalSupply: number;
    minted: number;
    sold: number;
    totalVolume: string;
    floorPrice: string;
    owners: number;
  };

  // 元数据
  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

