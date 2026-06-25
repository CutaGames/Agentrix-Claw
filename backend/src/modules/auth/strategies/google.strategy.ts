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
    const apiBaseUrl = configService.get<string>('API_BASE_URL') || 'http://localhost:3001';
    const callbackURL = configService.get<string>('GOOGLE_CALLBACK_URL') || `${apiBaseUrl}/auth/google/callback`;
    
    console.log(`Google OAuth initialized with callbackURL: ${callbackURL}`);

    super({
      clientID: clientID || 'placeholder-client-id',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'placeholder-client-secret',
      callbackURL: callbackURL,
      scope: ['email', 'profile'],
      proxy: true,
    });

    if (!clientID) {
      console.warn('Google OAuth is not configured. Google login will not work.');
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

