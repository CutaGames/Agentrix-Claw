import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { 
  ProductReviewService, 
  SubmitReviewDto, 
  ReviewActionDto,
  ReviewListQueryDto 
} from './product-review.service';
import { ProductReviewStatus, ReviewType } from '../../entities/product-review.entity';

/**
 * 商品审核控制器
 */
@ApiTags('Product Review')
@Controller('products/review')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductReviewController {
  constructor(private readonly reviewService: ProductReviewService) {}

  // ============ 商户端接口 ============

  /**
   * 提交商品审核
   */
  @Post('submit')
  @ApiOperation({ summary: '提交商品审核' })
  @ApiResponse({ status: HttpStatus.CREATED, description: '审核已提交' })
  async submitForReview(@Request() req, @Body() dto: SubmitReviewDto) {
    const review = await this.reviewService.submitForReview(req.user.id, dto);
    return {
      success: true,
      message: '商品已提交审核',
      data: review,
    };
  }

  /**
   * 获取商户的审核记录
   */
  @Get('merchant/list')
  @ApiOperation({ summary: '获取商户的审核记录' })
  @ApiQuery({ name: 'status', required: false, enum: ProductReviewStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getMerchantReviews(
    @Request() req,
    @Query('status') status?: ProductReviewStatus,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    const result = await this.reviewService.getMerchantReviews(req.user.id, {
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
    return {
      success: true,
      data: result,
    };
  }

  /**
   * 获取审核详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取审核详情' })
  async getReviewDetail(@Param('id') id: string) {
    const review = await this.reviewService.getReviewDetail(id);
    return {
      success: true,
      data: review,
    };
  }

  // ============ 管理员接口 ============

  /**
   * 获取所有审核列表（管理员）
   */
  @Get('admin/list')
  @ApiOperation({ summary: '获取所有审核列表（管理员）' })
  @ApiQuery({ name: 'status', required: false, enum: ProductReviewStatus })
  @ApiQuery({ name: 'type', required: false, enum: ReviewType })
  @ApiQuery({ name: 'merchantId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getReviewList(@Query() query: ReviewListQueryDto) {
    const result = await this.reviewService.getReviewList(query);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * 执行审核操作（管理员）
   */
  @Post('admin/action')
  @ApiOperation({ summary: '执行审核操作（管理员）' })
  async performReviewAction(@Request() req, @Body() dto: ReviewActionDto) {
    const review = await this.reviewService.performReviewAction(req.user.id, dto);
    return {
      success: true,
      message: `审核操作 ${dto.action} 已完成`,
      data: review,
    };
  }

  /**
   * 批量审核（管理员）
   */
  @Post('admin/batch')
  @ApiOperation({ summary: '批量审核（管理员）' })
  async batchReview(
    @Request() req,
    @Body() body: { reviewIds: string[]; action: 'approve' | 'reject'; comment?: string },
  ) {
    const result = await this.reviewService.batchReview(
      req.user.id,
      body.reviewIds,
      body.action,
      body.comment,
    );
    return {
      success: true,
      message: `批量审核完成: 成功 ${result.success}, 失败 ${result.failed}`,
      data: result,
    };
  }

  /**
   * 获取审核统计（管理员）
   */
  @Get('admin/stats')
  @ApiOperation({ summary: '获取审核统计（管理员）' })
  async getReviewStats() {
    const stats = await this.reviewService.getReviewStats();
    return {
      success: true,
      data: stats,
    };
  }
}
