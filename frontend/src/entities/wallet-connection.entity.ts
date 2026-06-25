import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum WalletType {
  METAMASK = 'metamask',
  WALLETCONNECT = 'walletconnect',
  PHANTOM = 'phantom',
  OKX = 'okx',
}

export enum ChainType {
  EVM = 'evm',
  SOLANA = 'solana',
}

@Entity('wallet_connections')
@Index('IDX_wallet_connections_address', ['walletAddress'], { unique: true })
export class WalletConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: WalletType,
  })
  walletType: WalletType;

  @Column()
  walletAddress: string;

  @Column({
    type: 'enum',
    enum: ChainType,
  })
  chain: ChainType;

  @Column({ nullable: true })
  chainId: string;

  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  connectedAt: Date;

  @UpdateDateColumn()
  lastUsedAt: Date;
}

