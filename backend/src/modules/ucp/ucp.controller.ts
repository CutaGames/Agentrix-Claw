/**
 * UCP Controller
 * 
 * Implements UCP REST Binding endpoints
 * https://ucp.dev/specification/checkout-rest/
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { UCPService } from './ucp.service';
import {
  CreateCheckoutDto,
  UpdateCheckoutDto,
  CompleteCheckoutDto,
  CancelCheckoutDto,
  UCPBusinessProfile,
  UCPCheckoutSession,
} from './dto/ucp.dto';

@ApiTags('UCP - Universal Commerce Protocol')
@Controller()
export class UCPController {
  private readonly logger = new Logger(UCPController.name);

  constructor(private readonly ucpService: UCPService) {}

  /**
   * Business Profile Discovery Endpoint
   * GET /.well-known/ucp
   */
  @Get('.well-known/ucp')
  @ApiOperation({ summary: 'Get UCP Business Profile' })
  @ApiResponse({ status: 200, description: 'Business profile for UCP discovery' })
  getBusinessProfile(): UCPBusinessProfile {
    this.logger.log('UCP Business Profile requested');
    return this.ucpService.getBusinessProfile();
  }

  /**
   * Create Checkout Session
   * POST /ucp/v1/checkout-sessions
   */
  @Post('ucp/v1/checkout-sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create UCP Checkout Session' })
  @ApiHeader({ name: 'UCP-Agent', required: true, description: 'Platform profile URI' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Idempotency key' })
  @ApiResponse({ status: 201, description: 'Checkout session created' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @Headers('ucp-agent') ucpAgent?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<UCPCheckoutSession> {
    this.logger.log(`Create UCP checkout, agent: ${ucpAgent}`);
    return this.ucpService.createCheckout(dto, ucpAgent);
  }

  /**
   * Get Checkout Session
   * GET /ucp/v1/checkout-sessions/{id}
   */
  @Get('ucp/v1/checkout-sessions/:id')
  @ApiOperation({ summary: 'Get UCP Checkout Session' })
  @ApiHeader({ name: 'UCP-Agent', required: true, description: 'Platform profile URI' })
  @ApiResponse({ status: 200, description: 'Checkout session retrieved' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getCheckout(
    @Param('id') id: string,
    @Headers('ucp-agent') ucpAgent?: string,
  ): Promise<UCPCheckoutSession> {
    this.logger.log(`Get UCP checkout: ${id}`);
    return this.ucpService.getCheckout(id);
  }

  /**
   * Update Checkout Session
   * PUT /ucp/v1/checkout-sessions/{id}
   */
  @Put('ucp/v1/checkout-sessions/:id')
  @ApiOperation({ summary: 'Update UCP Checkout Session' })
  @ApiHeader({ name: 'UCP-Agent', required: true, description: 'Platform profile URI' })
  @ApiResponse({ status: 200, description: 'Checkout session updated' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async updateCheckout(
    @Param('id') id: string,
    @Body() dto: UpdateCheckoutDto,
    @Headers('ucp-agent') ucpAgent?: string,
  ): Promise<UCPCheckoutSession> {
    this.logger.log(`Update UCP checkout: ${id}`);
    return this.ucpService.updateCheckout(id, dto);
  }

  /**
   * Complete Checkout Session (Place Order)
   * POST /ucp/v1/checkout-sessions/{id}/complete
   */
  @Post('ucp/v1/checkout-sessions/:id/complete')
  @ApiOperation({ summary: 'Complete UCP Checkout Session' })
  @ApiHeader({ name: 'UCP-Agent', required: true, description: 'Platform profile URI' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Idempotency key' })
  @ApiResponse({ status: 200, description: 'Checkout completed' })
  @ApiResponse({ status: 400, description: 'Invalid request or payment failed' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async completeCheckout(
    @Param('id') id: string,
    @Body() dto: CompleteCheckoutDto,
    @Headers('ucp-agent') ucpAgent?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<UCPCheckoutSession> {
    this.logger.log(`Complete UCP checkout: ${id}`);
    return this.ucpService.completeCheckout(id, dto);
  }

  /**
   * Cancel Checkout Session
   * POST /ucp/v1/checkout-sessions/{id}/cancel
   */
  @Post('ucp/v1/checkout-sessions/:id/cancel')
  @ApiOperation({ summary: 'Cancel UCP Checkout Session' })
  @ApiHeader({ name: 'UCP-Agent', required: true, description: 'Platform profile URI' })
  @ApiResponse({ status: 200, description: 'Checkout cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed checkout' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async cancelCheckout(
    @Param('id') id: string,
    @Body() dto: CancelCheckoutDto,
    @Headers('ucp-agent') ucpAgent?: string,
  ): Promise<UCPCheckoutSession> {
    this.logger.log(`Cancel UCP checkout: ${id}`);
    return this.ucpService.cancelCheckout(id, dto.reason);
  }

  /**
   * UCP Product Catalog - 获取所有可购买的Skill/Product
   * GET /ucp/v1/products
   */
  @Get('ucp/v1/products')
  @ApiOperation({ summary: 'Get UCP Product Catalog - 获取所有支持UCP协议的商品和Skill' })
  @ApiResponse({ status: 200, description: 'Product catalog' })
  async getProductCatalog() {
    this.logger.log('UCP Product Catalog requested');
    return this.ucpService.getProductCatalog();
  }

  /**
   * UCP Skill Catalog - 专门获取Skill列表
   * GET /ucp/v1/skills
   */
  @Get('ucp/v1/skills')
  @ApiOperation({ summary: 'Get UCP Skill Catalog - 获取所有支持UCP协议的Skill' })
  @ApiResponse({ status: 200, description: 'Skill catalog' })
  async getSkillCatalog() {
    this.logger.log('UCP Skill Catalog requested');
    return this.ucpService.getSkillCatalog();
  }
}
