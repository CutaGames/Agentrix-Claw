import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CouponService, CreateCouponDto, ApplyCouponDto } from './coupon.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('coupon')
@Controller('coupon')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建优惠券' })
  async createCoupon(@Request() req: any, @Body() dto: CreateCouponDto) {
    return this.couponService.createCoupon({
      ...dto,
      merchantId: dto.merchantId || req.user.id, // 如果未提供merchantId，使用当前用户ID
    });
  }

  @Get('merchant/:merchantId')
  @Public()
  @ApiOperation({ summary: '获取商户的优惠券列表' })
  async getMerchantCoupons(@Param('merchantId') merchantId: string) {
    return this.couponService.getMerchantCoupons(merchantId);
  }

  @Get('available')
  @Public()
  @ApiOperation({ summary: '查找可用优惠券' })
  async findAvailableCoupons(
    @Query('merchantId') merchantId: string,
    @Query('orderAmount') orderAmount: number,
    @Query('productIds') productIds?: string,
    @Query('categoryIds') categoryIds?: string,
  ) {
    return this.couponService.findAvailableCoupons(
      merchantId,
      orderAmount,
      productIds ? productIds.split(',') : undefined,
      categoryIds ? categoryIds.split(',') : undefined,
    );
  }

  @Post('calculate')
  @Public()
  @ApiOperation({ summary: '计算优惠券折扣' })
  async calculateCoupon(@Body() dto: ApplyCouponDto) {
    return this.couponService.calculateCouponDiscount(dto);
  }

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '应用优惠券' })
  async applyCoupon(
    @Request() req: any,
    @Body() body: {
      couponId: string;
      orderId: string;
      originalAmount: number;
      discountAmount: number;
    },
  ) {
    return this.couponService.applyCoupon(
      body.couponId,
      body.orderId,
      req.user.id,
      body.originalAmount,
      body.discountAmount,
    );
  }
}

