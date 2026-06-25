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
import { AutoPayService } from './auto-pay.service';
import { CreateGrantDto, UpdateGrantDto } from './dto/auto-pay.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('auto-pay')
@ApiBearerAuth()
@Controller('auto-pay')
@UseGuards(JwtAuthGuard)
export class AutoPayController {
  constructor(private readonly autoPayService: AutoPayService) {}

  @Post('grants')
  @ApiOperation({ summary: '创建自动支付授权' })
  @ApiResponse({ status: 201, description: '授权创建成功' })
  async createGrant(@Request() req, @Body() dto: CreateGrantDto) {
    return this.autoPayService.createGrant(req.user.id, dto);
  }

  @Get('grants')
  @ApiOperation({ summary: '获取授权列表' })
  @ApiResponse({ status: 200, description: '返回授权列表' })
  async getGrants(@Request() req) {
    return this.autoPayService.getGrants(req.user.id);
  }

  @Put('grants/:id')
  @ApiOperation({ summary: '更新授权' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateGrant(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateGrantDto,
  ) {
    return this.autoPayService.updateGrant(req.user.id, id, dto);
  }

  @Delete('grants/:id')
  @ApiOperation({ summary: '撤销授权' })
  @ApiResponse({ status: 200, description: '撤销成功' })
  async revokeGrant(@Request() req, @Param('id') id: string) {
    return this.autoPayService.revokeGrant(req.user.id, id);
  }

  @Post('execute')
  @ApiOperation({ summary: '执行自动支付（Agent调用）' })
  @ApiResponse({ status: 201, description: '自动支付执行成功' })
  async executeAutoPayment(
    @Request() req,
    @Body() dto: {
      grantId: string;
      amount: number;
      recipient: string;
      description?: string;
    },
  ) {
    return this.autoPayService.executeAutoPayment({
      grantId: dto.grantId,
      agentId: req.user.id,
      userId: req.user.id, // TODO: 从grant中获取userId
      amount: dto.amount,
      recipient: dto.recipient,
      description: dto.description,
    });
  }
}

