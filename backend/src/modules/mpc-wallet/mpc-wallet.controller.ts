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
  CreateSocialMPCWalletDto,
} from './dto/mpc-wallet.dto';

@ApiTags('MPC Wallet')
@Controller('mpc-wallet')
export class MPCWalletController {
  constructor(private readonly mpcWalletService: MPCWalletService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 MPC 钱包' })
  @ApiResponse({ status: 201, description: 'MPC 钱包创建成功' })
  async createWallet(@Request() req, @Body() dto: CreateMPCWalletDto) {
    const ownerId = dto.agentAccountId || req.user.id;

    const result = await this.mpcWalletService.generateMPCWallet(
      ownerId,
      dto.password,
    );

    return {
      walletAddress: result.walletAddress,
      encryptedShardA: result.encryptedShardA, // 返回给前端存储
      encryptedShardC: result.encryptedShardC, // 返回给商户备份
      message: '请妥善保管分片 A 和分片 C，这是恢复钱包的唯一方式',
    };
  }

  @Post('create-for-social')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '为社交登录用户创建 MPC 钱包' })
  @ApiResponse({ status: 201, description: 'MPC 钱包创建成功' })
  async createWalletForSocialLogin(@Request() req, @Body() dto: CreateSocialMPCWalletDto) {
    const userId = req.user.id;
    
    // 使用社交账号 ID 作为密码的一部分来派生密钥
    const derivedPassword = `${dto.socialProviderId}_${userId}_agentrix_mpc_v1`;

    const result = await this.mpcWalletService.generateMPCWalletForUser(
      userId,
      derivedPassword,
      dto.chain || 'BSC',
    );

    return {
      walletAddress: result.walletAddress,
      encryptedShardA: result.encryptedShardA,
      encryptedShardC: result.encryptedShardC,
      recoveryHint: '使用相同的社交账号登录即可恢复钱包',
    };
  }

  @Get('check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '检查用户是否有 MPC 钱包' })
  @ApiResponse({ status: 200, description: '返回钱包状态' })
  async checkWallet(@Request() req) {
    const userId = req.user.id;
    const hasWallet = await this.mpcWalletService.userHasMPCWallet(userId);
    let walletInfo = null;
    
    if (hasWallet) {
      try {
        const wallet = await this.mpcWalletService.getMPCWalletByUserId(userId);
        walletInfo = {
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          isActive: wallet.isActive,
        };
      } catch {}
    }
    
    return {
      hasWallet,
      wallet: walletInfo,
    };
  }

  @Get('my-wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的 MPC 钱包' })
  @ApiResponse({ status: 200, description: '返回 MPC 钱包信息' })
  async getMyWallet(@Request() req) {
    const ownerId = req.user.id;
    const wallet = await this.mpcWalletService.getMPCWallet(ownerId);

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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '恢复钱包（使用分片 A + C）' })
  @ApiResponse({ status: 200, description: '钱包恢复成功' })
  async recoverWallet(@Request() req, @Body() dto: RecoverWalletDto) {
    const ownerId = req.user.id;
    const walletAddress = await this.mpcWalletService.recoverWallet(
      ownerId,
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

