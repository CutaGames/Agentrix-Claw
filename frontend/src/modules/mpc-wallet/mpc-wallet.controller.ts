import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MPCWalletService } from './mpc-wallet.service';
import {
  CreateMPCWalletDto,
  RecoverWalletDto,
} from './dto/mpc-wallet.dto';

@ApiTags('MPC Wallet')
@Controller('mpc-wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MPCWalletController {
  constructor(private readonly mpcWalletService: MPCWalletService) {}

  @Post('create')
  @ApiOperation({ summary: '创建 MPC 钱包' })
  @ApiResponse({ status: 201, description: 'MPC 钱包创建成功' })
  async createWallet(@Request() req, @Body() dto: CreateMPCWalletDto) {
    const merchantId = req.user.id;

    // 验证用户是否为商户
    if (!req.user.roles?.includes('merchant')) {
      throw new Error('Only merchants can create MPC wallets');
    }

    const result = await this.mpcWalletService.generateMPCWallet(
      merchantId,
      dto.password,
    );

    return {
      walletAddress: result.walletAddress,
      encryptedShardA: result.encryptedShardA, // 返回给前端存储
      encryptedShardC: result.encryptedShardC, // 返回给商户备份
      message: '请妥善保管分片 A 和分片 C，这是恢复钱包的唯一方式',
    };
  }

  @Get('my-wallet')
  @ApiOperation({ summary: '获取我的 MPC 钱包' })
  @ApiResponse({ status: 200, description: '返回 MPC 钱包信息' })
  async getMyWallet(@Request() req) {
    const merchantId = req.user.id;
    const wallet = await this.mpcWalletService.getMPCWallet(merchantId);

    // 不返回加密的分片 B
    return {
      id: wallet.id,
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      currency: wallet.currency,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }


  @Post('recover')
  @ApiOperation({ summary: '恢复钱包（使用分片 A + C）' })
  @ApiResponse({ status: 200, description: '钱包恢复成功' })
  async recoverWallet(@Request() req, @Body() dto: RecoverWalletDto) {
    const merchantId = req.user.id;
    const walletAddress = await this.mpcWalletService.recoverWallet(
      merchantId,
      dto.encryptedShardA,
      dto.encryptedShardC,
      dto.password,
    );

    return {
      success: true,
      walletAddress,
      message: '钱包恢复成功',
    };
  }
}

