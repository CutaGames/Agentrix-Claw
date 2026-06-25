import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RemoteControlController } from './remote-control.controller';
import { RemoteControlGateway } from './remote-control.gateway';
import { CrossDeviceTokenService } from './cross-device-token.service';

/**
 * RemoteControlModule — P-9 wave 10.
 *
 * - HTTP `POST /v1/cross-device/token` for minting 30s scoped JWTs
 * - WebSocket `/remote-control` namespace for routing execute / ack
 *
 * Reuses the project's standard JwtModule registration with JWT_SECRET
 * from ConfigService, so issued tokens validate against the same
 * pipeline as auth.
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30s' },
      }),
    }),
  ],
  controllers: [RemoteControlController],
  providers: [CrossDeviceTokenService, RemoteControlGateway],
  exports: [CrossDeviceTokenService],
})
export class RemoteControlModule {}
