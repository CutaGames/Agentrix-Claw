import {
  Controller,
  Get,
  Post,
  Put,
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
import { QuickPayGrantService, CreateQuickPayGrantDto } from './quick-pay-grant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('quick-pay-grants')
@Controller('quick-pay-grants')
export class QuickPayGrantController {
  constructor(private readonly grantService: QuickPayGrantService) {}

  @Post()
  @ApiOperation({ summary: '创建QuickPay授权（V3.0：快速支付授权）' })
  @ApiResponse({ status: 201, description: '返回创建的授权' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createGrant(
    @Request() req: any,
    @Body() dto: CreateQuickPayGrantDto,
  ) {
    return this.grantService.createGrant(req.user?.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取我的QuickPay授权列表' })
  @ApiResponse({ status: 200, description: '返回授权列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMyGrants(@Request() req: any) {
    return this.grantService.getUserGrants(req.user?.id);
  }

  @Get(':grantId')
  @ApiOperation({ summary: '获取授权详情' })
  @ApiResponse({ status: 200, description: '返回授权详情' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getGrant(
    @Request() req: any,
    @Param('grantId') grantId: string,
  ) {
    return this.grantService.getGrant(grantId, req.user?.id);
  }

  @Put(':grantId/revoke')
  @ApiOperation({ summary: '撤销QuickPay授权' })
  @ApiResponse({ status: 200, description: '返回撤销的授权' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async revokeGrant(
    @Request() req: any,
    @Param('grantId') grantId: string,
  ) {
    return this.grantService.revokeGrant(grantId, req.user?.id);
  }
}

