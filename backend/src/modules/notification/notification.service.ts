import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType, DevicePushToken } from '../../entities/notification.entity';
import { CreateNotificationDto } from './dto/notification.dto';
// import { WebSocketGateway } from '../websocket/websocket.gateway'; // 暂时禁用WebSocket

/** Expo Push API endpoint */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN ?? '';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(DevicePushToken)
    private pushTokenRepo: Repository<DevicePushToken>,
    // @Inject(forwardRef(() => WebSocketGateway))
    // private wsGateway: WebSocketGateway, // 暂时禁用WebSocket
  ) {}

  async getNotifications(
    userId: string,
    read?: boolean,
    type?: string,
    limit: number = 50,
  ) {
    const effectiveLimit = Number(limit) || 50;
    const query = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC')
      .limit(effectiveLimit);

    if (read !== undefined) {
      query.andWhere('notification.read = :read', { read });
    }

    if (type) {
      query.andWhere('notification.type = :type', { type });
    }

    return query.getMany();
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationRepository.count({
      where: {
        userId,
        read: false,
      },
    });

    return { count };
  }

  async createNotification(userId: string, dto: CreateNotificationDto) {
    const notification = this.notificationRepository.create({
      userId,
      ...dto,
    });

    const saved = await this.notificationRepository.save(notification);
    this.logger.log(`创建通知: ${saved.id} for user ${userId}`);

    // Send push notification for important types (approval, transaction, etc.)
    const pushTypes: string[] = ['approval', 'transaction', 'airdrop', 'earning', 'system'];
    if (pushTypes.includes(saved.type)) {
      this.sendPushNotification(userId, {
        title: saved.title,
        body: saved.message ?? saved.title,
        data: { notificationId: saved.id, type: saved.type },
        channelId: saved.type === 'approval' ? 'approvals' : saved.type === 'transaction' ? 'transactions' : undefined,
      }).catch((err) => {
        this.logger.warn(`Push notification failed for user ${userId}: ${err?.message}`);
      });
    }
    // try {
    //   this.wsGateway.sendNotification(userId, {
    //     id: saved.id,
    //     type: saved.type,
    //     title: saved.title,
    //     message: saved.message,
    //     read: saved.read,
    //     actionUrl: saved.actionUrl,
    //     timestamp: saved.createdAt,
    //   });

    //   // 更新未读数量
    //   const unreadCount = await this.getUnreadCount(userId);
    //   this.wsGateway.sendUnreadCountUpdate(userId, unreadCount.count);
    // } catch (error) {
    //   this.logger.warn(`WebSocket 推送失败: ${error.message}`);
    // }

    return saved;
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('通知不存在');
    }

    notification.read = true;
    await this.notificationRepository.save(notification);

    // 更新未读数量（暂时禁用WebSocket）
    // try {
    //   const unreadCount = await this.getUnreadCount(userId);
    //   this.wsGateway.sendUnreadCountUpdate(userId, unreadCount.count);
    // } catch (error) {
    //   this.logger.warn(`WebSocket 推送失败: ${error.message}`);
    // }

    return { message: '已标记为已读' };
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepository.update(
      { userId, read: false },
      { read: true },
    );

    // 更新未读数量（暂时禁用WebSocket）
    // try {
    //   this.wsGateway.sendUnreadCountUpdate(userId, 0);
    // } catch (error) {
    //   this.logger.warn(`WebSocket 推送失败: ${error.message}`);
    // }

    return { message: '所有通知已标记为已读' };
  }

  async deleteNotification(userId: string, id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('通知不存在');
    }

    await this.notificationRepository.remove(notification);

    return { message: '通知已删除' };
  }

  /**
   * Register / update a device push token for the user.
   * Persists to DB for durability across restarts.
   */
  async registerPushToken(
    userId: string,
    token: string,
    platform: string,
    deviceId?: string,
  ): Promise<void> {
    // Upsert: if the user already has a token row, update it
    let entity = await this.pushTokenRepo.findOne({ where: { userId } });
    if (!entity) {
      entity = this.pushTokenRepo.create({ userId });
    }
    entity.token = token;
    entity.platform = platform;
    entity.deviceId = deviceId;
    await this.pushTokenRepo.save(entity);
    this.logger.log(`Push token registered for user ${userId} (${platform})`);
  }

  /**
   * Retrieve the registered push token for a user (for sending notifications).
   */
  async getPushToken(userId: string) {
    const entity = await this.pushTokenRepo.findOne({ where: { userId } });
    if (!entity) return null;
    return {
      token: entity.token,
      platform: entity.platform,
      deviceId: entity.deviceId,
      registeredAt: entity.registeredAt,
    };
  }

  /**
   * Send a push notification to a user via Expo Push API.
   * Requires EXPO_ACCESS_TOKEN env var for production use.
   */
  async sendPushNotification(
    userId: string,
    params: { title: string; body: string; data?: Record<string, any>; channelId?: string },
  ): Promise<boolean> {
    const device = await this.getPushToken(userId);
    if (!device) {
      this.logger.warn(`No push token for user ${userId}, skipping push`);
      return false;
    }

    const message: Record<string, any> = {
      to: device.token,
      title: params.title,
      body: params.body,
      sound: 'default',
      ...(params.data ? { data: params.data } : {}),
      ...(params.channelId ? { channelId: params.channelId } : {}),
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (EXPO_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
      }

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
      });

      const result = await res.json();
      if (result?.data?.status === 'ok') {
        this.logger.log(`Push sent to user ${userId}`);
        return true;
      }

      this.logger.warn(`Push failed for user ${userId}: ${JSON.stringify(result)}`);
      return false;
    } catch (error) {
      this.logger.error(`Push notification error for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Approve a notification (for approval-type notifications).
   * Marks it as read and sets approvalStatus to 'approved'.
   */
  async approveNotification(userId: string, id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    notification.read = true;
    (notification as any).approvalStatus = 'approved';
    await this.notificationRepository.save(notification);
    this.logger.log(`Notification ${id} approved by user ${userId}`);
    return { message: '已批准' };
  }

  /**
   * Reject a notification (for approval-type notifications).
   * Marks it as read and sets approvalStatus to 'rejected'.
   */
  async rejectNotification(userId: string, id: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    notification.read = true;
    (notification as any).approvalStatus = 'rejected';
    await this.notificationRepository.save(notification);
    this.logger.log(`Notification ${id} rejected by user ${userId}`);
    return { message: '已拒绝' };
  }
}

