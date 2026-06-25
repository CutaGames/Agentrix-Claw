import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillReview } from '../../entities/skill-review.entity';
import { Skill } from '../../entities/skill.entity';

@Injectable()
export class SkillReviewService {
  constructor(
    @InjectRepository(SkillReview)
    private reviewRepository: Repository<SkillReview>,
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
  ) {}

  /**
   * 获取技能的评价列表
   */
  async getReviews(skillId: string, page: number = 1, limit: number = 20) {
    const [reviews, total] = await this.reviewRepository.findAndCount({
      where: { skillId },
      relations: ['reviewer'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      reviews: reviews.map(r => ({
        id: r.id,
        userId: r.reviewerId,
        userName: r.reviewer?.nickname || r.reviewer?.email || 'Anonymous',
        rating: Number(r.rating),
        comment: r.comment || '',
        createdAt: r.createdAt,
        verifiedUsage: r.verifiedUsage,
        helpfulCount: r.helpfulCount,
      })),
      total,
    };
  }

  /**
   * 提交评价
   */
  async submitReview(
    skillId: string,
    userId: string,
    data: { rating: number; comment: string },
  ) {
    // 验证技能存在
    const skill = await this.skillRepository.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能不存在');
    }

    // 检查是否已评价（每人每技能只能评一次）
    const existing = await this.reviewRepository.findOne({
      where: { skillId, reviewerId: userId },
    });
    if (existing) {
      throw new BadRequestException('你已经评价过该技能');
    }

    // 验证评分范围
    if (data.rating < 1 || data.rating > 5) {
      throw new BadRequestException('评分必须在 1-5 之间');
    }

    const review = this.reviewRepository.create({
      skillId,
      reviewerId: userId,
      rating: data.rating,
      comment: data.comment,
      reviewerType: 'user',
      verifiedUsage: false,
    });

    const saved = await this.reviewRepository.save(review);

    // 更新技能平均评分
    await this.updateSkillRating(skillId);

    return {
      id: saved.id,
      userId: saved.reviewerId,
      userName: 'You',
      rating: Number(saved.rating),
      comment: saved.comment,
      createdAt: saved.createdAt,
    };
  }

  /**
   * 更新技能平均评分
   */
  private async updateSkillRating(skillId: string) {
    const result = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avgRating')
      .addSelect('COUNT(*)', 'count')
      .where('review.skillId = :skillId', { skillId })
      .getRawOne();

    const avgRating = parseFloat(result?.avgRating || '0');
    const reviewCount = parseInt(result?.count || '0');

    await this.skillRepository.update(skillId, {
      rating: Math.round(avgRating * 10) / 10,
    } as any);
  }
}
