import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CommissionService } from './commission.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('commissions')
@ApiBearerAuth()
@Controller('commissions')
@UseGuards(JwtAuthGuard)
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  @Get()
  @ApiOperation({ summary: '获取分润记录' })
  @ApiResponse({ status: 200, description: '返回分润记录' })
  async getCommissions(@Request() req) {
    return this.commissionService.getCommissions(req.user.id);
  }

  @Get('settlements')
  @ApiOperation({ summary: '获取结算记录' })
  @ApiResponse({ status: 200, description: '返回结算记录' })
  async getSettlements(@Request() req) {
    return this.commissionService.getSettlements(req.user.id);
  }

  @Post('settle')
  @ApiOperation({ summary: '执行结算（T+1）' })
  @ApiResponse({ status: 201, description: '结算执行成功' })
  async executeSettlement(
    @Request() req,
    @Body() dto: { payeeType: string; currency?: string },
  ) {
    return this.commissionService.executeSettlement(
      req.user.id,
      dto.payeeType as any,
      dto.currency || 'CNY',
    );
  }
}

