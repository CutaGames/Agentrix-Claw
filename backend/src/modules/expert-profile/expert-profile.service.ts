import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

@Injectable()
export class ExpertProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getProfile(userId: string) {
    // Mock implementation - 返回模拟的专家档案
    return {
      id: `expert_${userId}`,
      userId,
      title: '高级技术顾问',
      specialty: 'AI & Blockchain',
      bio: '拥有10年AI和区块链开发经验',
      avatar: '/api/placeholder/avatar.jpg',
      hourlyRate: 200,
      currency: 'USD',
      availability: true,
      verified: false,
      rating: 4.8,
      totalConsultations: 156,
      completedConsultations: 142,
      totalEarnings: 28400,
      capabilityCards: [
        {
          id: 'card_1',
          title: 'AI 模型调优',
          description: '专业的AI模型性能优化服务',
          skills: ['Machine Learning', 'Deep Learning', 'TensorFlow'],
          pricing: { amount: 200, currency: 'USD' },
        },
      ],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async createProfile(userId: string, data: any) {
    // Mock implementation
    return {
      id: `expert_${userId}`,
      userId,
      ...data,
      status: 'pending',
      verified: false,
      createdAt: new Date(),
    };
  }

  async updateProfile(userId: string, data: any) {
    // Mock implementation
    return {
      id: `expert_${userId}`,
      userId,
      ...data,
      updatedAt: new Date(),
    };
  }

  async getSLAMetrics(userId: string) {
    // Mock implementation - 返回SLA指标
    return {
      responseTime: 2.5, // hours
      successRate: 96.8, // percentage
      customerSatisfaction: 4.8, // rating
      targetResponseTime: 3,
      targetSuccessRate: 95,
      targetSatisfaction: 4.5,
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    };
  }

  async updateSLAConfig(userId: string, config: any) {
    // Mock implementation
    return {
      userId,
      ...config,
      updatedAt: new Date(),
    };
  }

  async getConsultations(expertId: string, requesterId: string) {
    // Mock implementation - 返回咨询列表
    return [
      {
        id: 'consult_1',
        expertId,
        requesterId,
        title: 'AI模型性能优化咨询',
        status: 'pending',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        duration: 60,
        price: 200,
        currency: 'USD',
        createdAt: new Date(),
      },
    ];
  }

  async addCapabilityCard(userId: string, card: any) {
    // Mock implementation
    return {
      id: `card_${Date.now()}`,
      expertId: `expert_${userId}`,
      ...card,
      createdAt: new Date(),
    };
  }

  async updateCapabilityCard(userId: string, cardId: string, data: any) {
    // Mock implementation
    return {
      id: cardId,
      ...data,
      updatedAt: new Date(),
    };
  }

  async deleteCapabilityCard(userId: string, cardId: string) {
    // Mock implementation - 直接返回成功
    return;
  }

  async requestVerification(userId: string, data: any) {
    // Mock implementation
    return {
      userId,
      status: 'submitted',
      ...data,
      submittedAt: new Date(),
    };
  }

  async acceptConsultation(userId: string, consultationId: string) {
    // Mock implementation
    return {
      id: consultationId,
      status: 'accepted',
      acceptedAt: new Date(),
    };
  }

  async completeConsultation(userId: string, consultationId: string, data: any) {
    // Mock implementation
    return {
      id: consultationId,
      status: 'completed',
      completedAt: new Date(),
      ...data,
    };
  }
}
