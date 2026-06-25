import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { ConnectWalletDto, VerifySignatureDto } from './dto/wallet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('connect')
  @ApiOperation({ summary: '连接钱包' })
  @ApiResponse({ status: 201, description: '钱包连接成功' })
  async connectWallet(@Request() req, @Body() dto: ConnectWalletDto) {
    return this.walletService.connectWallet(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取用户钱包列表' })
  @ApiResponse({ status: 200, description: '返回钱包列表' })
  async getWallets(@Request() req) {
    return this.walletService.getUserWallets(req.user.id);
  }

  @Put(':walletId/default')
  @ApiOperation({ summary: '设置默认钱包' })
  @ApiResponse({ status: 200, description: '设置成功' })
  async setDefaultWallet(@Request() req, @Param('walletId') walletId: string) {
    return this.walletService.setDefaultWallet(req.user.id, walletId);
  }

  @Delete(':walletId')
  @ApiOperation({ summary: '断开钱包连接' })
  @ApiResponse({ status: 200, description: '断开成功' })
  async disconnectWallet(
    @Request() req,
    @Param('walletId') walletId: string,
  ) {
    return this.walletService.disconnectWallet(req.user.id, walletId);
  }

  @Post('verify-signature')
  @ApiOperation({ summary: '验证钱包签名' })
  @ApiResponse({ status: 200, description: '验证结果' })
  async verifySignature(@Request() req, @Body() dto: VerifySignatureDto) {
    return this.walletService.verifySignature(req.user.id, dto);
  }
}

