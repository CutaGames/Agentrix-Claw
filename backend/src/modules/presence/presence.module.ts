import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';

/**
 * PresenceModule — 跨端 presence(净新建,设计 §7 / Requirement 8)。
 *
 * 组成:
 *  - `PresenceService`:内存 TTL map + 心跳 + sweep(task 2.1)。
 *  - `PresenceController`:`POST /heartbeat` + `GET /:instanceId`(task 2.2,JwtAuthGuard,仅限本人 instance)。
 *  - 归属校验需要读 `openclaw_instances`,故 forFeature([OpenClawInstance])。
 *
 * WS 推送接线(task 2.2,设计 §7.2「复用现有 WS 网关广播 presence:update,5s 内同步」):
 *  `PresenceService` 暴露 `registerPushHandler` 注入缝,保持自身与任何网关解耦、可单测。
 *  本模块在启动时(`onModuleInit`)注册回调,把 presence 变化经**现有**的跨端 WS 广播
 *  通道(`desktopSyncEventBus` → agent-presence `PresenceGateway`,该网关已把所有
 *  `presence:*` 事件转发到 `user:{userId}` 房间)以 `presence:update` 事件下发给该用户
 *  的在线端。即复用既有 WS 通道,不新建网关/协议(R8.4)。
 *
 * `PresenceService` 对外 export,供 task 4.2(桌面首连成功后建立 presence)等调用方注入。
 */
@Module({
  imports: [TypeOrmModule.forFeature([OpenClawInstance])],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule implements OnModuleInit {
  private readonly logger = new Logger(PresenceModule.name);

  constructor(private readonly presenceService: PresenceService) {}

  onModuleInit(): void {
    // 把 presence 状态变化经现有 WS 广播通道下发:任何 `presence:*` 事件都会被
    // agent-presence `PresenceGateway` 转发到 `user:{userId}` 房间,从而 5s 内
    // 同步给该用户的移动端 / 桌面端在线连接(R8.4)。
    this.presenceService.registerPushHandler((update) => {
      emitDesktopSyncEvent(update.userId, 'presence:update', update);
    });
    this.logger.log('Presence push handler wired to cross-device WS broadcast (presence:update)');
  }
}
