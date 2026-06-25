import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { KYCService } from './kyc.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('compliance')
@ApiBearerAuth()
@Controller('compliance')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly kycService: KYCService) {}

  @Post('kyc')
  @ApiOperation({ summary: '创建KYC申请' })
  @ApiResponse({ status: 201, description: 'KYC申请创建成功' })
  async createKYC(@Request() req, @Body() body: any) {
    return this.kycService.createKYC({
      userId: req.user.id,
      ...body,
    });
  }

  @Get('kyc/status')
  @ApiOperation({ summary: '获取KYC状态' })
  @ApiResponse({ status: 200, description: '返回KYC状态' })
  async getKYCStatus(@Request() req) {
    return this.kycService.getKYCStatus(req.user.id);
  }

  @Post('kyt')
  @ApiOperation({ summary: '执行KYT检查' })
  @ApiResponse({ status: 200, description: '返回KYT检查结果' })
  async performKYT(@Body() body: {
    transactionHash: string;
    fromAddress: string;
    toAddress: string;
    amount: number;
    currency: string;
  }) {
    return this.kycService.performKYT(body);
  }

  @Get('transaction-limits')
  @ApiOperation({ summary: '获取交易限额' })
  @ApiResponse({ status: 200, description: '返回交易限额' })
  async getTransactionLimits(@Request() req) {
    return this.kycService.getTransactionLimits(req.user.id);
  }

  @Post('merchant/kyb')
  @ApiOperation({ summary: '创建商户KYB' })
  @ApiResponse({ status: 201, description: 'KYB申请创建成功' })
  async createMerchantKYB(@Request() req, @Body() body: {
    companyName: string;
    registrationNumber: string;
    businessLicense: string;
    legalRepresentative: string;
    address: string;
  }) {
    return this.kycService.createMerchantKYB({
      merchantId: req.user.id,
      ...body,
    });
  }
}

