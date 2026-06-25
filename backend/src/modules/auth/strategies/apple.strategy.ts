import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('APPLE_CLIENT_ID');
    const apiBaseUrl = configService.get<string>('API_BASE_URL') || 'http://localhost:3001';
    const callbackURL = configService.get<string>('APPLE_CALLBACK_URL') || `${apiBaseUrl}/auth/apple/callback`;
    
    super({
      clientID: clientID || 'placeholder-client-id',
      teamID: configService.get<string>('APPLE_TEAM_ID') || 'placeholder-team-id',
      keyID: configService.get<string>('APPLE_KEY_ID') || 'placeholder-key-id',
      privateKeyString: configService.get<string>('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n') || 'placeholder-private-key',
      callbackURL: callbackURL,
      passReqToCallback: false,
      scope: ['email', 'name'],
    });

    if (!clientID) {
      console.warn('Apple OAuth is not configured. Apple login will not work.');
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    idToken: string,
    profile: any,
  ): Promise<any> {
    // Apple only sends the profile (name/email) on the first login
    const { id, name, email } = profile || {};
    return {
      appleId: id,
      email: email,
      firstName: name?.firstName,
      lastName: name?.lastName,
      accessToken,
      idToken,
    };
  }
}
