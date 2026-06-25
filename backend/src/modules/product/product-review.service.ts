import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ProductReview, ProductReviewStatus, ReviewType } from '../../entities/product-review.entity';
import { Product, ProductStatus } from '../../entities/product.entity';

/**
 * 提交审核DTO
 */
export interface SubmitReviewDto {
  productId: string;
  type?: ReviewType;
}

/**
 * 审核操作DTO
 */
export interface ReviewActionDto {
  reviewId: string;
  action: 'approve' | 'reject' | 'request_revision';
  comment?: string;
  rejectionReason?: string;
  revisionFields?: string[];
}

/**
 * 审核列表查询DTO
 */
export interface ReviewListQueryDto {
  status?: ProductReviewStatus;
  type?: ReviewType;
  merchantId?: string;
  reviewerId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 商品审核服务
 */
@Injectable()
export class ProductReviewService {
  private readonly logger = new Logger(ProductReviewService.name);

  constructor(
    @InjectRepository(ProductReview)
    private readonly reviewRepository: Repository<ProductReview>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  /**
   * 提交商品审核
   */
  async submitForReview(merchantId: string, dto: SubmitReviewDto): Promise<ProductReview> {
    const product = await this.productRepository.findOne({
      where: { id: dto.productId, merchantId },
    });

    if (!product) {
      throw new NotFoundException('商品不存在或无权限');
    }

    // 检查是否有待处理的审核
    const pendingReview = await this.reviewRepository.findOne({
      where: { 
        productId: dto.productId, 
        status: ProductReviewStatus.PENDING 
      },
    });

    if (pendingReview) {
      throw new BadRequestException('该商品已有待处理的审核请求');
    }

    // 创建审核记录
    const review = this.reviewRepository.create({
      productId: dto.productId,
      merchantId,
      type: dto.type || ReviewType.NEW_PRODUCT,
      status: ProductReviewStatus.PENDING,
      productSnapshot: {
        name: product.name,
        description: product.description,
        price: Number(product.price),
        category: product.category,
        productType: product.productType,
        images: product.metadata?.images || [],
        metadata: product.metadata,
      },
    });

    // 执行自动审核
    review.autoReviewResult = await this.performAutoReview(product);

    const savedReview = await this.reviewRepository.save(review);

    // 更新商品状态为审核中
    await this.productRepository.update(product.id, {
      status: ProductStatus.PENDING_REVIEW,
    });

    this.logger.log(`商品 ${product.name} 已提交审核，审核ID: ${savedReview.id}`);

    return savedReview;
  }

  /**
   * 自动审核
   */
  private async performAutoReview(product: Product): Promise<ProductReview['autoReviewResult']> {
    const issues: ProductReview['autoReviewResult']['issues'] = [];
    const recommendations: string[] = [];
    let score = 100;

    // 检查商品名称
    if (!product.name || product.name.length < 5) {
      issues.push({ field: 'name', issue: '商品名称过短', severity: 'medium' });
      score -= 10;
    }
    if (product.name && product.name.length > 200) {
      issues.push({ field: 'name', issue: '商品名称过长', severity: 'low' });
      score -= 5;
    }

    // 检查描述
    if (!product.description || product.description.length < 20) {
      issues.push({ field: 'description', issue: '商品描述过短，建议添加更详细的描述', severity: 'medium' });
      score -= 15;
      recommendations.push('添加至少50字的商品描述以提高转化率');
    }

    // 检查价格
    if (!product.price || Number(product.price) <= 0) {
      issues.push({ field: 'price', issue: '价格无效', severity: 'high' });
      score -= 30;
    }

    // 检查图片（从 metadata 获取）
    const images = product.metadata?.images || [];
    if (!images || images.length === 0) {
      issues.push({ field: 'images', issue: '缺少商品图片', severity: 'high' });
      score -= 20;
      recommendations.push('添加至少一张商品图片以提高用户体验');
    }

    // 检查分类
    if (!product.category) {
      issues.push({ field: 'category', issue: '未设置商品分类', severity: 'medium' });
      score -= 10;
    }

    // 检查敏感词（示例）
    const sensitiveWords = ['假货', '仿品', '盗版', '违禁'];
    const content = `${product.name} ${product.description}`.toLowerCase();
    for (const word of sensitiveWords) {
      if (content.includes(word)) {
        issues.push({ field: 'content', issue: `内容包含敏感词: ${word}`, severity: 'high' });
        score -= 30;
      }
    }

    return {
      passed: score >= 60 && !issues.some(i => i.severity === 'high'),
      score: Math.max(0, score),
      issues,
      recommendations,
    };
  }

  /**
   * 执行审核操作（管理员）
   */
  async performReviewAction(reviewerId: string, dto: ReviewActionDto): Promise<ProductReview> {
    const review = await this.reviewRepository.findOne({
      where: { id: dto.reviewId },
      relations: ['product'],
    });

    if (!review) {
      throw new NotFoundException('审核记录不存在');
    }

    if (review.status !== ProductReviewStatus.PENDING && 
        review.status !== ProductReviewStatus.NEEDS_REVISION) {
      throw new BadRequestException('该审核已处理');
    }

    review.reviewerId = reviewerId;
    review.reviewComment = dto.comment;
    review.reviewedAt = new Date();

    let newProductStatus: ProductStatus;

    switch (dto.action) {
      case 'approve':
        review.status = ProductReviewStatus.APPROVED;
        newProductStatus = ProductStatus.ACTIVE;
        this.logger.log(`商品审核通过: ${review.productId}`);
        break;

      case 'reject':
        review.status = ProductReviewStatus.REJECTED;
        review.rejectionReason = dto.rejectionReason;
        newProductStatus = ProductStatus.REJECTED;
        this.logger.log(`商品审核拒绝: ${review.productId}, 原因: ${dto.rejectionReason}`);
        break;

      case 'request_revision':
        review.status = ProductReviewStatus.NEEDS_REVISION;
        review.revisionFields = dto.revisionFields;
        newProductStatus = ProductStatus.INACTIVE; // 需要修改时暂时下架
        this.logger.log(`商品需要修改: ${review.productId}, 字段: ${dto.revisionFields?.join(', ')}`);
        break;

      default:
        throw new BadRequestException('无效的审核操作');
    }

    await this.reviewRepository.save(review);

    // 更新商品状态
    await this.productRepository.update(review.productId, {
      status: newProductStatus,
    });

    return review;
  }

  /**
   * 获取审核列表（管理员）
   */
  async getReviewList(query: ReviewListQueryDto) {
    const qb = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.product', 'product')
      .leftJoinAndSelect('review.merchant', 'merchant')
      .leftJoinAndSelect('review.reviewer', 'reviewer');

    if (query.status) {
      qb.andWhere('review.status = :status', { status: query.status });
    }

    if (query.type) {
      qb.andWhere('review.type = :type', { type: query.type });
    }

    if (query.merchantId) {
      qb.andWhere('review.merchantId = :merchantId', { merchantId: query.merchantId });
    }

    if (query.reviewerId) {
      qb.andWhere('review.reviewerId = :reviewerId', { reviewerId: query.reviewerId });
    }

    if (query.dateFrom) {
      qb.andWhere('review.submittedAt >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('review.submittedAt <= :dateTo', { dateTo: query.dateTo });
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    qb.orderBy('review.submittedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取商户的审核记录
   */
  async getMerchantReviews(merchantId: string, query: { status?: ProductReviewStatus; page?: number; pageSize?: number }) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    const where: any = { merchantId };
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await this.reviewRepository.findAndCount({
      where,
      relations: ['product'],
      order: { submittedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取审核详情
   */
  async getReviewDetail(reviewId: string): Promise<ProductReview> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['product', 'merchant', 'reviewer'],
    });

    if (!review) {
      throw new NotFoundException('审核记录不存在');
    }

    return review;
  }

  /**
   * 获取审核统计
   */
  async getReviewStats() {
    const stats = await this.reviewRepository
      .createQueryBuilder('review')
      .select('review.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('review.status')
      .getRawMany();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = await this.reviewRepository
      .createQueryBuilder('review')
      .where('review.submittedAt >= :today', { today })
      .getCount();

    const avgReviewTime = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(EXTRACT(EPOCH FROM (review.reviewed_at - review.submitted_at)) / 3600)', 'avgHours')
      .where('review.reviewed_at IS NOT NULL')
      .getRawOne();

    return {
      byStatus: stats.reduce((acc, s) => ({ ...acc, [s.status]: parseInt(s.count) }), {}),
      todaySubmissions: todayCount,
      avgReviewTimeHours: parseFloat(avgReviewTime?.avgHours || '0').toFixed(2),
    };
  }

  /**
   * 批量审核
   */
  async batchReview(reviewerId: string, reviewIds: string[], action: 'approve' | 'reject', comment?: string) {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const reviewId of reviewIds) {
      try {
        await this.performReviewAction(reviewerId, {
          reviewId,
          action,
          comment,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${reviewId}: ${error.message}`);
      }
    }

    return results;
  }
}
