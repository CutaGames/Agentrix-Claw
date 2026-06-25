import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { EcommerceConnection, EcommercePlatform } from './ecommerce-connection.entity';
import { Product } from './product.entity';

/**
 * 商品同步映射实体
 * 用于追踪Agentrix商品与外部电商平台商品的对应关系
 */
@Entity('product_sync_mappings')
@Index(['connectionId', 'externalProductId'], { unique: true })
@Index(['productId'])
export class ProductSyncMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 关联的电商连接
   */
  @Column()
  connectionId: string;

  @ManyToOne(() => EcommerceConnection, { onDelete: 'CASCADE' })
  @JoinColumn()
  connection: EcommerceConnection;

  /**
   * Agentrix商品ID
   */
  @Column()
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  /**
   * 外部平台商品ID
   */
  @Column()
  externalProductId: string;

  /**
   * 外部平台类型
   */
  @Column({
    type: 'enum',
    enum: EcommercePlatform,
  })
  platform: EcommercePlatform;

  /**
   * 外部商品数据快照
   */
  @Column({ type: 'jsonb',  nullable: true })
  externalData: {
    title: string;
    price: number;
    sku?: string;
    barcode?: string;
    inventoryQuantity?: number;
    status?: string;
    images?: string[];
    variants?: Array<{
      id: string;
      title: string;
      price: number;
      sku?: string;
    }>;
  };

  /**
   * 同步方向
   */
  @Column({ default: 'import' })
  syncDirection: 'import' | 'export';

  /**
   * 最后同步时间
   */
  @Column({ type: 'timestamp' })
  lastSyncedAt: Date;

  /**
   * 同步版本号（用于检测变更）
   */
  @Column({ default: 1 })
  syncVersion: number;

  @CreateDateColumn()
  createdAt: Date;
}
