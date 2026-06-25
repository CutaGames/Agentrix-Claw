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

/**
 * 电商平台类型
 */
export enum EcommercePlatform {
  SHOPIFY = 'shopify',
  WOOCOMMERCE = 'woocommerce',
  ETSY = 'etsy',
  AMAZON = 'amazon',
  EBAY = 'ebay',
  CUSTOM = 'custom',
}

/**
 * 同步状态
 */
export enum SyncStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  SYNCING = 'syncing',
  ERROR = 'error',
}

/**
 * 电商平台连接实体
 */
@Entity('ecommerce_connections')
@Index(['merchantId', 'platform'])
export class EcommerceConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 商户ID
   */
  @Column()
  merchantId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  merchant: User;

  /**
   * 电商平台类型
   */
  @Column({
    type: 'enum',
    enum: EcommercePlatform,
  })
  platform: EcommercePlatform;

  /**
   * 店铺名称
   */
  @Column()
  storeName: string;

  /**
   * 店铺URL
   */
  @Column({ nullable: true })
  storeUrl: string;

  /**
   * 连接凭证（加密存储）
   */
  @Column({ type: 'jsonb' })
  credentials: {
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    apiSecret?: string;
    shopDomain?: string;  // Shopify
    consumerKey?: string;  // WooCommerce
    consumerSecret?: string;  // WooCommerce
  };

  /**
   * 同步配置
   */
  @Column({ type: 'jsonb', name: 'sync_config', default: {} })
  syncConfig: {
    autoSync: boolean;
    syncInterval: number; // 分钟
    syncDirection: 'import' | 'export' | 'bidirectional';
    categoryMapping?: Record<string, string>;
    priceMarkup?: number; // 价格加成百分比
    defaultProductType?: string;
    importFilters?: {
      categories?: string[];
      priceRange?: { min?: number; max?: number };
      status?: string[];
    };
  };

  /**
   * 同步状态
   */
  @Column({
    type: 'enum',
    enum: SyncStatus,
    default: SyncStatus.DISCONNECTED,
  })
  status: SyncStatus;

  /**
   * 最后同步时间
   */
  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;

  /**
   * 同步统计
   */
  @Column({ type: 'jsonb', name: 'sync_stats', default: {} })
  syncStats: {
    totalProducts: number;
    importedProducts: number;
    exportedProducts: number;
    lastSyncResult?: {
      success: boolean;
      imported: number;
      updated: number;
      failed: number;
      errors: string[];
    };
  };

  /**
   * 是否激活
   */
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
