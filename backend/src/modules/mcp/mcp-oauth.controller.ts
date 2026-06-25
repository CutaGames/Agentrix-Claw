import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { McpOAuthService } from './mcp-oauth.service';

@ApiTags('mcp-oauth')
@Controller('mcp-oauth')
export class McpOAuthController {
  constructor(private readonly mcpOAuth: McpOAuthService) {}

  @Get('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start OAuth flow for MCP server' })
  async initiateOAuth(
    @Request() req: any,
    @Query('provider') providerName: string,
    @Query('authorizationUrl') authorizationUrl: string,
    @Query('tokenUrl') tokenUrl: string,
    @Query('clientId') clientId: string,
    @Query('clientSecret') clientSecret: string,
    @Query('scopes') scopes: string,
    @Query('redirectUri') redirectUri: string,
  ) {
    const provider = {
      name: providerName,
      authorizationUrl,
      tokenUrl,
      clientId,
      clientSecret,
      scopes: scopes ? scopes.split(',') : [],
      redirectUri,
    };
    return this.mcpOAuth.initiateFlow(req.user.id, provider);
  }

  @Get('callback')
  @ApiOperation({ summary: 'OAuth callback handler' })
  async oauthCallback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Query('provider') providerName: string,
    @Query('tokenUrl') tokenUrl: string,
    @Query('clientId') clientId: string,
    @Query('clientSecret') clientSecret: string,
    @Query('redirectUri') redirectUri: string,
  ) {
    const provider = {
      name: providerName,
      authorizationUrl: '',
      tokenUrl,
      clientId,
      clientSecret,
      scopes: [],
      redirectUri,
    };
    const tokens = await this.mcpOAuth.handleCallback(state, code, provider);
    if (!tokens) {
      return { success: false, error: 'OAuth token exchange failed' };
    }
    return { success: true, expiresAt: tokens.expiresAt };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check OAuth token status for a provider' })
  async getStatus(
    @Request() req: any,
    @Query('provider') providerId: string,
  ) {
    return {
      hasTokens: this.mcpOAuth.hasTokens(req.user.id, providerId),
    };
  }

  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke OAuth tokens for a provider' })
  async revokeTokens(
    @Request() req: any,
    @Query('provider') providerId: string,
  ) {
    this.mcpOAuth.revokeTokens(req.user.id, providerId);
    return { revoked: true };
  }
}
