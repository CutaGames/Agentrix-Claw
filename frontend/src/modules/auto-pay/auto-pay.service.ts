import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoPayGrant } from '../../entities/auto-pay-grant.entity';
import { CreateGrantDto, UpdateGrantDto } from './dto/auto-pay.dto';
import { AutoPayExecutorService, AutoPaymentRequest } from './auto-pay-executor.service';

@Injectable()
export class AutoPayService {
  constructor(
    @InjectRepository(AutoPayGrant)
    private grantRepository: Repository<AutoPayGrant>,
    private executorService: AutoPayExecutorService,
  ) {}

  async createGrant(userId: string, dto: CreateGrantDto) {
    const grant = this.grantRepository.create({
      userId,
      agentId: dto.agentId,
      singleLimit: dto.singleLimit,
      dailyLimit: dto.dailyLimit,
      expiresAt: new Date(Date.now() + dto.duration * 24 * 60 * 60 * 1000),
    });

    return this.grantRepository.save(grant);
  }

  async getGrants(userId: string) {
    return this.grantRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async updateGrant(userId: string, id: string, dto: UpdateGrantDto) {
    const grant = await this.grantRepository.findOne({
      where: { id, userId },
    });

    if (!grant) {
      throw new NotFoundException('授权不存在');
    }

    Object.assign(grant, dto);
    return this.grantRepository.save(grant);
  }

  async revokeGrant(userId: string, id: string) {
    const grant = await this.grantRepository.findOne({
      where: { id, userId },
    });

    if (!grant) {
      throw new NotFoundException('授权不存在');
    }

    grant.isActive = false;
    return this.grantRepository.save(grant);
  }

  /**
   * 执行自动支付
   */
  async executeAutoPayment(request: AutoPaymentRequest) {
    // 从grantId获取userId
    const grant = await this.grantRepository.findOne({
      where: { id: request.grantId },
    });

    if (!grant) {
      throw new NotFoundException('授权不存在');
    }

    return this.executorService.executeAutoPayment({
      ...request,
      userId: grant.userId,
    });
  }
}

