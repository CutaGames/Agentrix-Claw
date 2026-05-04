import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Plan, PlanRunnerService, SubmitPlanInput } from './plan-runner.service';

/**
 * 顿领 §5.4 Plan-Approval 闭环 (P1-4)
 *
 *   POST /api/v1/plan/submit
 *   POST /api/v1/plan/:id/run        审批通过后 trigger
 *   GET  /api/v1/plan/:id
 *   GET  /api/v1/plan                ?status=
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/plan')
export class PlanRunnerController {
  constructor(private readonly service: PlanRunnerService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('submit')
  submit(@Req() req: any, @Body() body: SubmitPlanInput) {
    return this.service.submit(this.uid(req), body);
  }

  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string) {
    return this.service.runAfterApproval(id, this.uid(req));
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.service.get(id, this.uid(req));
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: Plan['status']) {
    return this.service.list(this.uid(req), status);
  }
}
