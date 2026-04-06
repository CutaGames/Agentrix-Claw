import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OAuthController } from './oauth.controller';
import { SocialAccountService } from './social-account.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { AppleStrategy } from './strategies/apple.strategy';
import { TwitterStrategy } from './strategies/twitter.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { WalletConnection } from '../../entities/wallet-connection.entity';
import { SocialAccount } from '../../entities/social-account.entity';
import { AdminUser } from '../../entities/admin-user.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { UserAgent } from '../../entities/user-agent.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { UserProviderConfig } from '../../entities/user-provider-config.entity';
import { DesktopPairSession } from '../../entities/desktop-pair-session.entity';
import { ApiKeyModule } from '../api-key/api-key.module';
import { AccountModule } from '../account/account.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UnifiedAuthGuard } from './guards/unified-auth.guard';
import { ApiKeyGuard } from '../api-key/guards/api-key.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, WalletConnection, SocialAccount, AdminUser, OpenClawInstance, UserAgent, AgentAccount, UserProviderConfig, DesktopPairSession]),
    PassportModule,
    ApiKeyModule,
    forwardRef(() => AccountModule),
    forwardRef(() => AiProviderModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-secret'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '30d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    SocialAccountService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    AppleStrategy,
    TwitterStrategy,
    JwtAuthGuard,
    ApiKeyGuard,
    UnifiedAuthGuard,
  ],
  exports: [AuthService, SocialAccountService, JwtAuthGuard, ApiKeyGuard, UnifiedAuthGuard],
})
export class AuthModule {}

