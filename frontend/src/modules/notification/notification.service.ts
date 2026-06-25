import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../entities/notification.entity';
import { CreateNotificationDto } from './dto/notification.dto';
// import { WebSocketGateway } from '../websocket/websocket.gateway'; // 暂时禁用WebSocket

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    // @Inject(forwardRef(() => WebSocketGateway))
    // private wsGateway: WebSocketGateway, // 暂时禁用WebSocket
  ) {}

  async getNotifications(
    userId: string,
    read?: boolean,
    type?: string,
    limit: number = 50,
  ) {
    const query = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC')
      .limit(limit);

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

    // 通过 WebSocket 发送通知（暂时禁用）
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
}

