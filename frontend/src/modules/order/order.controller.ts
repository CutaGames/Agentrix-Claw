import {
  Controller,
  Get,
  Post,
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
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: '创建订单' })
  @ApiResponse({ status: 201, description: '订单创建成功' })
  async createOrder(@Request() req, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取订单列表' })
  @ApiResponse({ status: 200, description: '返回订单列表' })
  async getOrders(@Request() req) {
    return this.orderService.getOrders(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取订单详情' })
  @ApiResponse({ status: 200, description: '返回订单详情' })
  async getOrder(@Request() req, @Param('id') id: string) {
    return this.orderService.getOrder(req.user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消订单' })
  @ApiResponse({ status: 200, description: '订单已取消' })
  async cancelOrder(@Request() req, @Param('id') id: string) {
    return this.orderService.cancelOrder(req.user.id, id);
  }
}

