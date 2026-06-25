import { Controller, Get, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';

@Controller('.well-known')
@Public()
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(private readonly configService: ConfigService) {}

  @Get('oauth-authorization-server')
  async getOAuthConfiguration(@Req() req: Request) {
    const baseUrl = 'https://api.agentrix.top';  // 固定使用 api.agentrix.top
    this.logger.log(`Serving OAuth configuration for ${baseUrl}`);

    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/api/auth/mcp/authorize`,
      token_endpoint: `${baseUrl}/api/auth/mcp/token`,
      jwks_uri: `${baseUrl}/api/auth/mcp/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
      scopes_supported: ['openid', 'profile', 'email', 'mcp'],
      code_challenge_methods_supported: ['S256', 'plain'],
    };
  }

  @Get('openid-configuration')
  async getOpenIdConfiguration(@Req() req: Request) {
    const baseUrl = 'https://api.agentrix.top';  // 固定使用 api.agentrix.top
    this.logger.log(`Serving OpenID configuration for ${baseUrl}`);

    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/api/auth/mcp/authorize`,
      token_endpoint: `${baseUrl}/api/auth/mcp/token`,
      userinfo_endpoint: `${baseUrl}/api/auth/mcp/userinfo`,
      jwks_uri: `${baseUrl}/api/auth/mcp/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256', 'none'],
      scopes_supported: ['openid', 'profile', 'email', 'mcp'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
      claims_supported: ['sub', 'iss', 'auth_time', 'name', 'given_name', 'family_name', 'nickname', 'profile', 'picture', 'website', 'email', 'email_verified', 'locale', 'zoneinfo'],
    };
  }

  private getBaseUrl(req: Request): string {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}`;
  }
}
