import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateReview } from '../../entities/template-review.entity';
import { AgentTemplate } from '../../entities/agent-template.entity';
import { UserAgent } from '../../entities/user-agent.entity';

export interface CreateReviewDto {
  templateId: string;
  rating: number; // 1-5
  comment?: string;
}

@Injectable()
export class TemplateReviewService {
  private readonly logger = new Logger(TemplateReviewService.name);

  constructor(
    @InjectRepository(TemplateReview)
    private readonly reviewRepository: Repository<TemplateReview>,
    @InjectRepository(AgentTemplate)
    private readonly templateRepository: Repository<AgentTemplate>,
    @InjectRepository(UserAgent)
    private readonly userAgentRepository: Repository<UserAgent>,
  ) {}

  /**
   * 创建评论
   */
  async createReview(userId: string, dto: CreateReviewDto): Promise<TemplateReview> {
    // 验证评分范围
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // 验证模板是否存在
    const template = await this.templateRepository.findOne({
      where: { id: dto.templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // 检查是否已评论
    const existingReview = await this.reviewRepository.findOne({
      where: { userId, templateId: dto.templateId },
    });

    if (existingReview) {
      throw new BadRequestException('Review already exists');
    }

    // 检查用户是否使用过该模板（验证购买/使用）
    const hasUsedTemplate = await this.userAgentRepository.findOne({
      where: { userId, templateId: dto.templateId },
    });

    const review = this.reviewRepository.create({
      templateId: dto.templateId,
      userId,
      rating: dto.rating,
      comment: dto.comment,
      isVerified: !!hasUsedTemplate, // 如果使用过模板，标记为已验证
    });

    const savedReview = await this.reviewRepository.save(review);

    // 更新模板平均评分
    await this.updateTemplateRating(dto.templateId);

    return savedReview;
  }

  /**
   * 获取模板评论列表
   */
  async getTemplateReviews(
    templateId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ reviews: TemplateReview[]; total: number; averageRating: number }> {
    const [reviews, total] = await this.reviewRepository.findAndCount({
      where: { templateId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: params?.limit || 10,
      skip: params?.offset || 0,
    });

    // 计算平均评分
    const allReviews = await this.reviewRepository.find({
      where: { templateId },
      select: ['rating'],
    });

    const averageRating =
      allReviews.length > 0
        ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
        : 0;

    return {
      reviews,
      total,
      averageRating: Math.round(averageRating * 10) / 10,
    };
  }

  /**
   * 更新评论
   */
  async updateReview(
    reviewId: string,
    userId: string,
    dto: Partial<CreateReviewDto>,
  ): Promise<TemplateReview> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId, userId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (dto.rating !== undefined) {
      if (dto.rating < 1 || dto.rating > 5) {
        throw new BadRequestException('Rating must be between 1 and 5');
      }
      review.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      review.comment = dto.comment;
    }

    const savedReview = await this.reviewRepository.save(review);

    // 更新模板平均评分
    await this.updateTemplateRating(review.templateId);

    return savedReview;
  }

  /**
   * 删除评论
   */
  async deleteReview(reviewId: string, userId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId, userId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const templateId = review.templateId;
    await this.reviewRepository.remove(review);

    // 更新模板平均评分
    await this.updateTemplateRating(templateId);
  }

  /**
   * 更新模板平均评分
   */
  private async updateTemplateRating(templateId: string): Promise<void> {
    const reviews = await this.reviewRepository.find({
      where: { templateId },
      select: ['rating'],
    });

    if (reviews.length === 0) {
      return;
    }

    const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    // 更新模板的 metadata 中的评分
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (template) {
      template.metadata = {
        ...template.metadata,
        averageRating: Math.round(averageRating * 10) / 10,
        reviewCount: reviews.length,
      };
      await this.templateRepository.save(template);
    }
  }
}

