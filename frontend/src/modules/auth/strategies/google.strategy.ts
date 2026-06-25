import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    
    // 如果缺少配置，使用占位符值（避免启动错误）
    // 实际使用时需要配置 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET
    super({
      clientID: clientID || 'placeholder-client-id',
      clientSecret: clientSecret || 'placeholder-client-secret',
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/auth/google/callback'),
      scope: ['email', 'profile'],
    });
    
    // 如果缺少配置，输出警告
    if (!clientID || !clientSecret) {
      console.warn('⚠️  GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET 未配置，Google OAuth 功能将不可用');
      console.warn('   如需启用 Google OAuth，请在 .env 文件中添加：');
      console.warn('   GOOGLE_CLIENT_ID=your-google-client-id');
      console.warn('   GOOGLE_CLIENT_SECRET=your-google-client-secret');
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;
    const user = {
      googleId: id,
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0].value,
      accessToken,
    };
    done(null, user);
  }
}

