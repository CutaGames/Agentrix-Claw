/**
 * X402 Discovery Controller
 * 
 * 提供 X402 协议服务发现端点
 * GET /.well-known/x402
 */

import {
  Controller,
  Get,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill, SkillStatus } from '../../entities/skill.entity';
import { ConfigService } from '@nestjs/config';

export interface X402ServiceInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  pricing: {
    amount: number;
    currency: string;
    unit: 'per_call' | 'per_token' | 'subscription';
  };
  endpoint: string;
  paymentAddress: string;
  supportedChains: string[];
  supportedTokens: string[];
}

export interface X402DiscoveryResponse {
  version: string;
  provider: {
    name: string;
    url: string;
    description: string;
  };
  services: X402ServiceInfo[];
  paymentConfig: {
    defaultChain: string;
    defaultToken: string;
    paymentAddress: string;
  };
  timestamp: string;
}

@ApiTags('X402 Discovery')
@Controller()
export class X402DiscoveryController {
  private readonly logger = new Logger(X402DiscoveryController.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    private configService: ConfigService,
  ) {}

  /**
   * X402 Service Discovery Endpoint
   * GET /.well-known/x402
   */
  @Get('.well-known/x402')
  @ApiOperation({ summary: 'X402 Service Discovery - 发现所有支持X402支付的服务' })
  @ApiResponse({ status: 200, description: 'X402 services list' })
  async getX402Services(): Promise<X402DiscoveryResponse> {
    this.logger.log('X402 Service Discovery requested');

    const baseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.io');
    const paymentAddress = this.configService.get('X402_PAYMENT_ADDRESS', '0xdf8e26fab0553ec755073f1c923c14942ad0d816');

    // 获取所有启用X402的已发布Skill
    const x402Skills = await this.skillRepository.find({
      where: {
        status: SkillStatus.PUBLISHED,
        x402Enabled: true,
      },
      order: {
        callCount: 'DESC',
      },
      take: 100, // 限制返回数量
    });

    // 转换为X402服务格式
    const services: X402ServiceInfo[] = x402Skills.map(skill => ({
      id: skill.id,
      name: skill.displayName || skill.name,
      description: skill.description,
      version: skill.version || '1.0.0',
      pricing: {
        amount: skill.pricing?.pricePerCall || 0,
        currency: skill.pricing?.currency || 'USDC',
        unit: 'per_call',
      },
      endpoint: skill.x402ServiceEndpoint || `${baseUrl}/api/skill/${skill.id}/execute`,
      paymentAddress: paymentAddress,
      supportedChains: ['bsc', 'ethereum', 'polygon', 'base'],
      supportedTokens: ['USDC', 'USDT'],
    }));

    return {
      version: '1.0.0',
      provider: {
        name: 'Agentrix',
        url: baseUrl,
        description: 'AI Agent能力市场 - 支持X402协议的Skill服务',
      },
      services,
      paymentConfig: {
        defaultChain: 'bsc',
        defaultToken: 'USDC',
        paymentAddress,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 获取单个Skill的X402信息
   */
  @Get('.well-known/x402/services/:skillId')
  @ApiOperation({ summary: '获取单个Skill的X402服务信息' })
  @ApiResponse({ status: 200, description: 'X402 service info' })
  async getX402ServiceById(skillId: string): Promise<X402ServiceInfo | null> {
    const baseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.io');
    const paymentAddress = this.configService.get('X402_PAYMENT_ADDRESS', '0xdf8e26fab0553ec755073f1c923c14942ad0d816');

    const skill = await this.skillRepository.findOne({
      where: {
        id: skillId,
        status: SkillStatus.PUBLISHED,
        x402Enabled: true,
      },
    });

    if (!skill) {
      return null;
    }

    return {
      id: skill.id,
      name: skill.displayName || skill.name,
      description: skill.description,
      version: skill.version || '1.0.0',
      pricing: {
        amount: skill.pricing?.pricePerCall || 0,
        currency: skill.pricing?.currency || 'USDC',
        unit: 'per_call',
      },
      endpoint: skill.x402ServiceEndpoint || `${baseUrl}/api/skill/${skill.id}/execute`,
      paymentAddress: paymentAddress,
      supportedChains: ['bsc', 'ethereum', 'polygon', 'base'],
      supportedTokens: ['USDC', 'USDT'],
    };
  }
}
