import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { A2AMatchingService, A2ATaskStatus } from './a2a-matching.service';

/**
 * 顿领 §10 A2A 跨用户撮合 (P2-8)
 *   POST /api/v1/a2a/tasks                    post a task
 *   GET  /api/v1/a2a/tasks?status=&tag=
 *   GET  /api/v1/a2a/tasks/:id
 *   POST /api/v1/a2a/tasks/:id/bids           bid
 *   GET  /api/v1/a2a/tasks/:id/bids
 *   POST /api/v1/a2a/tasks/:id/accept/:bidId  owner accepts -> creates trade
 *   POST /api/v1/a2a/trades/:id/deliver       seller marks delivered
 *   POST /api/v1/a2a/trades/:id/settle        buyer settles
 *   GET  /api/v1/a2a/trades                   my trades
 *   GET  /api/v1/a2a/stats
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/a2a')
export class A2AMatchingController {
  constructor(private readonly service: A2AMatchingService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('tasks')
  postTask(@Req() req: any, @Body() body: any) {
    return this.service.postTask(this.uid(req), body);
  }

  @Get('tasks')
  listTasks(
    @Query('status') status?: A2ATaskStatus,
    @Query('tag') tag?: string,
    @Query('owner_user_id') owner?: string,
  ) {
    return this.service.listTasks({ status, tag, owner_user_id: owner });
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    return this.service.getTask(id);
  }

  @Post('tasks/:id/bids')
  bid(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.bid(this.uid(req), id, body);
  }

  @Get('tasks/:id/bids')
  listBids(@Param('id') id: string) {
    return this.service.listBids(id);
  }

  @Post('tasks/:id/accept/:bidId')
  accept(@Req() req: any, @Param('id') id: string, @Param('bidId') bidId: string) {
    return this.service.acceptBid(this.uid(req), id, bidId);
  }

  @Post('trades/:id/deliver')
  deliver(@Req() req: any, @Param('id') id: string) {
    return this.service.deliver(this.uid(req), id);
  }

  @Post('trades/:id/settle')
  settle(@Req() req: any, @Param('id') id: string) {
    return this.service.settle(this.uid(req), id);
  }

  @Get('trades')
  listTrades(@Req() req: any) {
    return this.service.listTrades(this.uid(req));
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }
}
