import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingPlanService, PlanSku } from './billing-plan.service';

/**
 * Phase 6 / V4 §5.2 — Billing & subscription endpoints.
 *
 *   GET  /v1/billing/plan                      → 当前用户 plan tier
 *   GET  /v1/billing/skus                      → 可购买 plan SKU 目录（含 Stripe price id 是否配置）
 *   POST /v1/billing/checkout { sku, email? }  → 创建 Stripe Checkout Session, 返回 URL
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/billing')
export class BillingPlanController {
  constructor(private readonly service: BillingPlanService) {}

  @Get('plan')
  async getPlan(@Req() req: any) {
    const userId = uid(req);
    const tier = await this.service.getCurrentPlan(userId);
    return { tier };
  }

  @Get('skus')
  async listSkus() {
    return { skus: this.service.listSkus() };
  }

  @Post('checkout')
  async checkout(
    @Req() req: any,
    @Body() body: { sku: PlanSku; email?: string },
  ) {
    const userId = uid(req);
    const result = await this.service.createCheckoutSession({
      userId,
      sku: body.sku,
      customerEmail: body.email,
    });
    return result;
  }
}

function uid(req: any): string {
  const u = req?.user?.userId || req?.user?.sub || req?.user?.id;
  if (!u) throw new ForbiddenException('no user context');
  return u;
}
