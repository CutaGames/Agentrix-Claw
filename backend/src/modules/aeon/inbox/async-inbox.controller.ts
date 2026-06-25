import { Controller, Get, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AsyncInboxService } from './async-inbox.service';

/**
 * AsyncInboxController — 异步收件箱 digest API(Task 4.4 / R13.4/13.5)。
 * `v1/aeon/inbox`。离线回来聚合呈现任务/消息/工资/事件。
 */
@ApiTags('aeon/inbox')
@Controller('v1/aeon/inbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AsyncInboxController {
  constructor(private readonly inbox: AsyncInboxService) {}

  private uid(req: any): string {
    return req.user?.id || req.user?.sub;
  }

  @Get()
  @ApiOperation({ summary: '我的收件箱 digest' })
  list(@Request() req: any, @Query('unread') unread?: string) {
    const items = this.inbox.list(this.uid(req), unread === 'true');
    return { items, unreadCount: this.inbox.unreadCount(this.uid(req)) };
  }

  @Post('read')
  @ApiOperation({ summary: '标记已读' })
  markRead(@Request() req: any, @Body() body: { ids?: string[] }) {
    this.inbox.markRead(this.uid(req), body?.ids);
    return { ok: true, unreadCount: this.inbox.unreadCount(this.uid(req)) };
  }
}
