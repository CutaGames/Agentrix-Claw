import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SocialAccountService } from './social-account.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { WalletConnection } from '../../entities/wallet-connection.entity';
import { SocialAccount } from '../../entities/social-account.entity';
import { AdminUser } from '../../entities/admin-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, WalletConnection, SocialAccount, AdminUser]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-secret'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SocialAccountService, JwtStrategy, LocalStrategy, GoogleStrategy],
  exports: [AuthService, SocialAccountService],
})
export class AuthModule {}

