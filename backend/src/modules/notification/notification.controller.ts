import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { CreateNotificationDto, MarkAsReadDto } from './dto/notification.dto';

@ApiTags('通知')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '获取用户通知列表' })
  @ApiResponse({ status: 200, description: '返回通知列表' })
  async getNotifications(
    @Request() req,
    @Query('read') read?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationService.getNotifications(
      req.user.id,
      read === 'true' ? true : read === 'false' ? false : undefined,
      type,
      limit,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: '获取未读通知数量' })
  @ApiResponse({ status: 200, description: '返回未读数量' })
  async getUnreadCount(@Request() req) {
    return this.notificationService.getUnreadCount(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: '创建通知' })
  @ApiResponse({ status: 201, description: '通知创建成功' })
  async createNotification(
    @Request() req,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationService.createNotification(req.user.id, dto);
  }

  @Put(':id/read')
  @ApiOperation({ summary: '标记通知为已读' })
  @ApiResponse({ status: 200, description: '标记成功' })
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationService.markAsRead(req.user.id, id);
  }

  @Put('mark-all-read')
  @ApiOperation({ summary: '标记所有通知为已读' })
  @ApiResponse({ status: 200, description: '标记成功' })
  async markAllAsRead(@Request() req) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除通知' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteNotification(@Request() req, @Param('id') id: string) {
    return this.notificationService.deleteNotification(req.user.id, id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '批准审批请求' })
  @ApiResponse({ status: 200, description: '已批准' })
  async approveNotification(@Request() req, @Param('id') id: string) {
    return this.notificationService.approveNotification(req.user.id, id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '拒绝审批请求' })
  @ApiResponse({ status: 200, description: '已拒绝' })
  async rejectNotification(@Request() req, @Param('id') id: string) {
    return this.notificationService.rejectNotification(req.user.id, id);
  }

  /**
   * POST /api/notifications/register
   * Register a device push token for the current user.
   * Called by the mobile app on startup via notificationService.initialize().
   */
  @Post('register')
  @ApiOperation({ summary: '注册设备推送 Token (FCM/Expo)' })
  @ApiResponse({ status: 201, description: 'Token registered' })
  async registerDevice(
    @Request() req,
    @Body() body: { token: string; platform: string; deviceId?: string },
  ) {
    // Store the push token on the user's profile (in-memory for now; extend with DB persistence in next iteration)
    await this.notificationService.registerPushToken(
      req.user.id,
      body.token,
      body.platform,
      body.deviceId,
    );
    return { success: true, message: 'Push token registered' };
  }
}

