import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between, MoreThanOrEqual } from 'typeorm';
import { Product, ProductStatus, ProductType } from '../../../entities/product.entity';
import { User } from '../../../entities/user.entity';

export interface QueryProductsDto {
  page?: number;
  limit?: number;
  status?: string;
  productType?: string;
  search?: string;
  merchantId?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class ProductManagementService {
  private readonly logger = new Logger(ProductManagementService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 获取商品列表（管理员）
   */
  async getProducts(query: QueryProductsDto) {
    const {
      page = 1,
      limit = 20,
      status,
      productType,
      search,
      merchantId,
      category,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    if (productType && productType !== 'all') {
      where.productType = productType;
    }

    if (merchantId) {
      where.merchantId = merchantId;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.name = Like(`%${search}%`);
    }

    const [products, total] = await this.productRepository.findAndCount({
      where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // 获取商户信息
    const merchantIds = [...new Set(products.map(p => p.merchantId).filter(Boolean))];
    const merchants = merchantIds.length > 0
      ? await this.userRepository.find({
          where: { id: In(merchantIds) },
          select: ['id', 'email', 'nickname', 'agentrixId'],
        })
      : [];
    const merchantMap = new Map(merchants.map(m => [m.id, m]));

    const productsWithMerchant = products.map(product => ({
      ...product,
      merchant: merchantMap.get(product.merchantId) || null,
    }));

    return {
      data: productsWithMerchant,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取商品详情
   */
  async getProductById(id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    // 获取商户信息
    let merchant = null;
    if (product.merchantId) {
      merchant = await this.userRepository.findOne({
        where: { id: product.merchantId },
        select: ['id', 'email', 'nickname', 'agentrixId'],
      });
    }

    return {
      ...product,
      merchant,
    };
  }

  /**
   * 更新商品状态
   */
  async updateProductStatus(id: string, status: string, reason?: string) {
    const product = await this.productRepository.findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    await this.productRepository.update(id, {
      status: status as ProductStatus,
      updatedAt: new Date(),
    });

    this.logger.log(`商品 ${product.name} 状态已更新为 ${status}`);

    return {
      success: true,
      message: '状态已更新',
    };
  }

  /**
   * 获取商品统计数据
   */
  async getProductStatistics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 总商品数
    const totalProducts = await this.productRepository.count();

    // 已上架商品数
    const activeProducts = await this.productRepository.count({
      where: { status: ProductStatus.ACTIVE },
    });

    // 待审核商品数
    const pendingReview = await this.productRepository.count({
      where: { status: ProductStatus.PENDING_REVIEW },
    });

    // 今日新增
    const todayCreated = await this.productRepository.count({
      where: {
        createdAt: MoreThanOrEqual(today),
      },
    });

    // 按类型统计
    const byTypeResult = await this.productRepository
      .createQueryBuilder('product')
      .select('product.productType', 'productType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('product.productType')
      .getRawMany();

    const byType: Record<string, number> = {};
    byTypeResult.forEach(item => {
      byType[item.productType] = parseInt(item.count, 10);
    });

    // 按状态统计
    const byStatusResult = await this.productRepository
      .createQueryBuilder('product')
      .select('product.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('product.status')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    byStatusResult.forEach(item => {
      byStatus[item.status] = parseInt(item.count, 10);
    });

    return {
      data: {
        totalProducts,
        activeProducts,
        pendingReview,
        todayCreated,
        byType,
        byStatus,
      },
    };
  }

  /**
   * 获取商品分类列表
   */
  async getCategories() {
    const result = await this.productRepository
      .createQueryBuilder('product')
      .select('DISTINCT product.category', 'category')
      .where('product.category IS NOT NULL')
      .getRawMany();

    return {
      data: result.map(item => item.category).filter(Boolean),
    };
  }

  /**
   * 批量更新商品状态
   */
  async batchUpdateStatus(ids: string[], status: string) {
    await this.productRepository.update(
      { id: In(ids) },
      {
        status: status as ProductStatus,
        updatedAt: new Date(),
      },
    );

    this.logger.log(`批量更新 ${ids.length} 个商品状态为 ${status}`);

    return {
      success: true,
      message: `已更新 ${ids.length} 个商品`,
    };
  }

  /**
   * 删除商品（软删除）
   */
  async deleteProduct(id: string) {
    const product = await this.productRepository.findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    // 软删除：设置状态为已删除
    await this.productRepository.update(id, {
      status: ProductStatus.INACTIVE,
      updatedAt: new Date(),
    });

    this.logger.log(`商品 ${product.name} 已删除`);

    return {
      success: true,
      message: '商品已删除',
    };
  }
}
