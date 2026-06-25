import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-twitter';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwitterStrategy extends PassportStrategy(Strategy, 'twitter') {
  constructor(private configService: ConfigService) {
    // 支持多种环境变量命名方式
    const consumerKey = configService.get<string>('TWITTER_CONSUMER_KEY') 
      || configService.get<string>('TWITTER_API_KEY');
    const consumerSecret = configService.get<string>('TWITTER_CONSUMER_SECRET') 
      || configService.get<string>('TWITTER_APIKEY_SECRET');
    const apiBaseUrl = configService.get<string>('API_BASE_URL') || 'https://api.agentrix.top/api';
    const callbackURL = configService.get<string>('TWITTER_CALLBACK_URL') || `${apiBaseUrl}/auth/twitter/callback`;

    console.log(`Twitter OAuth initialized with callbackURL: ${callbackURL}`);
    if (!consumerKey || consumerKey === 'placeholder-consumer-key') {
      console.error('❌ Twitter OAuth is NOT configured correctly. TWITTER_API_KEY or TWITTER_CONSUMER_KEY is missing.');
    } else {
      console.log('✅ Twitter OAuth configured with API Key:', consumerKey.substring(0, 8) + '...');
    }

    super({
      consumerKey: consumerKey || 'placeholder-consumer-key',
      consumerSecret: consumerSecret || 'placeholder-consumer-secret',
      callbackURL: callbackURL,
      includeEmail: true,
    });

    if (!consumerKey) {
      console.warn('Twitter OAuth is not configured. Twitter login will not work.');
    }
  }

  async validate(
    token: string,
    tokenSecret: string,
    profile: any,
    done: (err: any, user: any) => void,
  ): Promise<any> {
    console.log('Twitter profile received:', JSON.stringify(profile, null, 2));
    const { id, username, displayName, emails, photos } = profile;
    const user = {
      twitterId: id,
      username,
      displayName,
      email: emails && emails.length > 0 ? emails[0].value : null,
      picture: photos && photos.length > 0 ? photos[0].value : null,
      token,
      tokenSecret,
    };
    done(null, user);
  }
}
