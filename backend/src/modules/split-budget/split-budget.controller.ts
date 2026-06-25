import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SplitBudgetService, SplitPayee } from './split-budget.service';

/**
 * 顿领 §9.3 §9.5 SplitPlan + BudgetPool + Audit (P1-8)
 *
 *   POST   /api/v1/split-plans
 *   GET    /api/v1/split-plans
 *   GET    /api/v1/split-plans/:id
 *   POST   /api/v1/split-plans/:id/toggle      {active}
 *   POST   /api/v1/split-plans/:id/preview     {amount_cents}
 *
 *   POST   /api/v1/budget-pools                {name, monthly_limit_cents, agent_ids?}
 *   GET    /api/v1/budget-pools
 *   GET    /api/v1/budget-pools/:id
 *   POST   /api/v1/budget-pools/:id/spend      {cents, note?}
 *
 *   GET    /api/v1/audit                       ?limit=
 */
@UseGuards(JwtAuthGuard)
@Controller('v1')
export class SplitBudgetController {
  constructor(private readonly service: SplitBudgetService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  // ── SplitPlan ───────────────────────────────────────────────────────

  @Post('split-plans')
  createSplit(
    @Req() req: any,
    @Body() body: { name: string; description?: string; payees: SplitPayee[] },
  ) {
    return this.service.createSplit(this.uid(req), body);
  }

  @Get('split-plans')
  listSplits(@Req() req: any) {
    return this.service.listSplits(this.uid(req));
  }

  @Get('split-plans/:id')
  getSplit(@Req() req: any, @Param('id') id: string) {
    return this.service.getSplit(this.uid(req), id);
  }

  @Post('split-plans/:id/toggle')
  toggleSplit(@Req() req: any, @Param('id') id: string, @Body() body: { active: boolean }) {
    return this.service.toggleSplit(this.uid(req), id, body.active);
  }

  @Post('split-plans/:id/preview')
  preview(@Req() req: any, @Param('id') id: string, @Body() body: { amount_cents: number }) {
    return this.service.previewSettlement(this.uid(req), id, body.amount_cents);
  }

  // ── BudgetPool ──────────────────────────────────────────────────────

  @Post('budget-pools')
  createPool(
    @Req() req: any,
    @Body() body: { name: string; monthly_limit_cents: number; agent_ids?: string[] },
  ) {
    return this.service.createPool(this.uid(req), {
      name: body.name,
      monthlyLimitCents: body.monthly_limit_cents,
      agentIds: body.agent_ids,
    });
  }

  @Get('budget-pools')
  listPools(@Req() req: any) {
    return this.service.listPools(this.uid(req));
  }

  @Get('budget-pools/:id')
  getPool(@Req() req: any, @Param('id') id: string) {
    return this.service.getPool(this.uid(req), id);
  }

  @Post('budget-pools/:id/spend')
  spend(@Req() req: any, @Param('id') id: string, @Body() body: { cents: number; note?: string }) {
    return this.service.spend(this.uid(req), id, body.cents, body.note);
  }

  // ── Audit ───────────────────────────────────────────────────────────

  @Get('audit')
  audit(@Req() req: any, @Query('limit') limit?: string) {
    return this.service.listAudit(this.uid(req), limit ? parseInt(limit, 10) : 100);
  }
}
