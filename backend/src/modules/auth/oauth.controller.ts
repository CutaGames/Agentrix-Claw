import { Controller, Get, Post, Body, Query, Res, Logger, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Public } from './decorators/public.decorator';

/**
 * Dummy OAuth2 Controller to satisfy ChatGPT MCP Connector requirements
 */
@Controller('oauth')
@Public()
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  /**
   * Authorization Endpoint
   * GET /api/oauth/authorize
   */
  @Get('authorize')
  async authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    this.logger.log(`OAuth authorize request from client: ${clientId}`);
    
    // In a real app, we would show a login page.
    // For now, we just redirect back with a dummy code.
    const code = 'dummy_auth_code_' + Math.random().toString(36).substring(7);
    const redirectUrl = `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}code=${code}&state=${state}`;
    
    this.logger.log(`Redirecting to: ${redirectUrl}`);
    return res.redirect(redirectUrl);
  }

  /**
   * Token Endpoint
   * POST /api/oauth/token
   */
  @Post('token')
  async token(
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Res() res: Response,
  ) {
    this.logger.log(`OAuth token request for code: ${code}`);
    
    // Return a dummy token
    return res.status(HttpStatus.OK).json({
      access_token: 'dummy_access_token_' + Math.random().toString(36).substring(7),
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'dummy_refresh_token',
      scope: 'all',
    });
  }
}
