import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  BadRequestException,
  ForbiddenException,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AmlScanService, AMLCheckResult, AMLRiskLevel } from './aml-scan.service';
import { ethers } from 'ethers';

/**
 * P2: AML 扫描控制器
 * 
 * 端点：
 * - POST /aml/check - 检查单个地址
 * - POST /aml/batch-check - 批量检查地址
 * - POST /aml/can-transact - 检查交易是否可执行
 * - POST /aml/blacklist/add - 添加地址到黑名单（仅管理员）
 * - DELETE /aml/blacklist/:address - 从黑名单移除（仅管理员）
 * - GET /aml/blacklist - 获取黑名单列表（仅管理员）
 */

// 简单的管理员检查函数
function checkAdmin(user: any): void {
  if (!user?.roles?.includes('admin')) {
    throw new ForbiddenException('Admin access required');
  }
}

@Controller('aml')
export class AmlScanController {
  private readonly logger = new Logger(AmlScanController.name);

  constructor(private readonly amlScanService: AmlScanService) {}

  /**
   * 检查单个地址的 AML 风险
   */
  @Post('check')
  @UseGuards(JwtAuthGuard)
  async checkAddress(
    @Body() body: {
      address: string;
      includeTransactionAnalysis?: boolean;
      network?: string;
    },
  ): Promise<{ success: boolean; data: AMLCheckResult }> {
    if (!body.address || !ethers.isAddress(body.address)) {
      throw new BadRequestException('Invalid Ethereum address');
    }

    const result = await this.amlScanService.checkAddress(body.address, {
      includeTransactionAnalysis: body.includeTransactionAnalysis,
      network: body.network,
    });

    return { success: true, data: result };
  }

  /**
   * 批量检查多个地址
   */
  @Post('batch-check')
  @UseGuards(JwtAuthGuard)
  async batchCheck(
    @Body() body: { addresses: string[] },
  ): Promise<{
    success: boolean;
    data: {
      results: Record<string, AMLCheckResult>;
      summary: {
        totalChecked: number;
        highRiskCount: number;
        blockedCount: number;
      };
    };
  }> {
    if (!body.addresses || !Array.isArray(body.addresses)) {
      throw new BadRequestException('addresses must be an array');
    }

    // 限制批量检查数量
    if (body.addresses.length > 100) {
      throw new BadRequestException('Maximum 100 addresses per batch');
    }

    // 验证地址格式
    const invalidAddresses = body.addresses.filter(addr => !ethers.isAddress(addr));
    if (invalidAddresses.length > 0) {
      throw new BadRequestException(`Invalid addresses: ${invalidAddresses.slice(0, 5).join(', ')}...`);
    }

    const batchResult = await this.amlScanService.checkAddresses(body.addresses);

    // 转换 Map 为对象
    const resultsObject: Record<string, AMLCheckResult> = {};
    batchResult.results.forEach((value, key) => {
      resultsObject[key] = value;
    });

    return {
      success: true,
      data: {
        results: resultsObject,
        summary: {
          totalChecked: batchResult.totalChecked,
          highRiskCount: batchResult.highRiskCount,
          blockedCount: batchResult.blockedCount,
        },
      },
    };
  }

  /**
   * 检查交易是否可以执行
   */
  @Post('can-transact')
  @UseGuards(JwtAuthGuard)
  async canTransact(
    @Body() body: {
      fromAddress: string;
      toAddress: string;
      amount: number;
      currency: string;
    },
  ): Promise<{
    success: boolean;
    data: {
      allowed: boolean;
      reason?: string;
      fromRiskLevel: AMLRiskLevel;
      toRiskLevel: AMLRiskLevel;
    };
  }> {
    if (!body.fromAddress || !ethers.isAddress(body.fromAddress)) {
      throw new BadRequestException('Invalid from address');
    }
    if (!body.toAddress || !ethers.isAddress(body.toAddress)) {
      throw new BadRequestException('Invalid to address');
    }
    if (!body.amount || body.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const result = await this.amlScanService.canExecuteTransaction(
      body.fromAddress,
      body.toAddress,
      body.amount,
      body.currency || 'USD',
    );

    return {
      success: true,
      data: {
        allowed: result.allowed,
        reason: result.reason,
        fromRiskLevel: result.fromCheck.riskLevel,
        toRiskLevel: result.toCheck.riskLevel,
      },
    };
  }

  /**
   * 添加地址到黑名单（仅管理员）
   */
  @Post('blacklist/add')
  @UseGuards(JwtAuthGuard)
  async addToBlacklist(
    @Body() body: { address: string; reason?: string },
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    checkAdmin(req.user);
    
    if (!body.address || !ethers.isAddress(body.address)) {
      throw new BadRequestException('Invalid Ethereum address');
    }

    this.amlScanService.addToBlacklist(body.address, body.reason);

    return {
      success: true,
      message: `Address ${body.address} added to blacklist`,
    };
  }

  /**
   * 从黑名单移除地址（仅管理员）
   */
  @Post('blacklist/remove')
  @UseGuards(JwtAuthGuard)
  async removeFromBlacklist(
    @Body() body: { address: string },
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    checkAdmin(req.user);
    
    if (!body.address || !ethers.isAddress(body.address)) {
      throw new BadRequestException('Invalid Ethereum address');
    }

    const removed = this.amlScanService.removeFromBlacklist(body.address);

    return {
      success: true,
      message: removed
        ? `Address ${body.address} removed from blacklist`
        : `Address ${body.address} was not in blacklist`,
    };
  }

  /**
   * 获取黑名单列表（仅管理员）
   */
  @Get('blacklist')
  @UseGuards(JwtAuthGuard)
  async getBlacklist(@Request() req: any): Promise<{
    success: boolean;
    data: { addresses: string[]; count: number };
  }> {
    checkAdmin(req.user);
    
    const addresses = this.amlScanService.getBlacklist();

    return {
      success: true,
      data: {
        addresses,
        count: addresses.length,
      },
    };
  }

  /**
   * 快速检查地址是否高风险（无需认证，用于前端预检）
   */
  @Get('quick-check/:address')
  async quickCheck(
    @Param('address') address: string,
  ): Promise<{
    address: string;
    riskLevel: AMLRiskLevel;
    isBlocked: boolean;
  }> {
    if (!ethers.isAddress(address)) {
      throw new BadRequestException('Invalid Ethereum address');
    }

    const result = await this.amlScanService.checkAddress(address);

    return {
      address: result.address,
      riskLevel: result.riskLevel,
      isBlocked: result.riskLevel === AMLRiskLevel.BLOCKED,
    };
  }
}
