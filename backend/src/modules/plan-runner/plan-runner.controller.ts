import { Body, Controller, Get, Param, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Plan, PlanRunnerService, SubmitPlanInput, PlanEvent } from './plan-runner.service';

/**
 * 顿领 §5.4 Plan-Approval 闭环 (P1-4) + Super Agent 可视化 (M1)
 *
 *   POST /api/v1/plan/submit
 *   POST /api/v1/plan/:id/run        审批通过后 trigger
 *   GET  /api/v1/plan/:id
 *   GET  /api/v1/plan                ?status=
 *   GET  /api/v1/plan/:id/stream     SSE — 实时事件流
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

  /**
   * SSE event stream for a single plan. Emits the current plan snapshot first, then
   * every plan.* event until the plan reaches a terminal state.
   *
   * Client usage:
   *   const es = new EventSource('/api/v1/plan/<id>/stream', { withCredentials: true })
   *   es.onmessage = (m) => render(JSON.parse(m.data))
   */
  @Sse(':id/stream')
  async stream(@Req() req: any, @Param('id') id: string): Promise<Observable<{ data: any }>> {
    const userId = this.uid(req);
    // Authorization probe — throws 404 if not owned by user
    const initial = await this.service.get(id, userId);

    return new Observable<{ data: any }>((subscriber) => {
      // 1) Push initial snapshot so the client can render immediately on connect
      subscriber.next({ data: { type: 'plan.snapshot', plan: initial, at: Date.now() } });

      // 2) If plan is already terminal, complete now
      if (initial.status === 'done' || initial.status === 'failed' || initial.status === 'denied') {
        subscriber.complete();
        return () => undefined;
      }

      // 3) Subscribe to live events; close on terminal event
      const unsub = this.service.subscribe(id, (e: PlanEvent) => {
        subscriber.next({ data: e });
        if (e.type === 'plan.done' || e.type === 'plan.failed') {
          subscriber.complete();
        }
      });
      return () => unsub();
    });
  }
}
