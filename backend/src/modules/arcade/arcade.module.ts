import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ArcadeGateway } from './arcade.gateway';
import { PongRoomService } from './pong-room.service';

/**
 * ArcadeModule — 权威实时对战(路径 A)。提供 `/arcade` 网关 + 权威 Pong 模拟。
 * JWT 握手鉴权(与 /aeon 同 secret)。后续动作类游戏在此模块加 room service + 复用网关骨架。
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ArcadeGateway, PongRoomService],
  exports: [PongRoomService],
})
export class ArcadeModule {}
