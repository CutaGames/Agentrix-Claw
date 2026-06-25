import { Controller, Get, Post, Query, Res, Body, Logger, Req, Inject, forwardRef } from '@nestjs/common';
import { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import * as crypto from 'crypto';

/**
 * P2: OAuth 2.0 完善
 * 
 * 实现真实的 OAuth 2.0 授权码流程：
 * 1. /authorize - 显示登录页面，用户授权后生成真实 code
 * 2. /token - 验证 code 并返回真实 JWT access_token
 * 3. /userinfo - 返回用户信息（可选）
 * 
 * 支持跨平台状态同步（ChatGPT -> 网站）
 */

interface AuthorizationCode {
  code: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  expiresAt: Date;
}

@Controller('oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);
  
  // 授权码存储（生产环境应使用 Redis）
  private authorizationCodes: Map<string, AuthorizationCode> = new Map();
  
  // 刷新令牌存储
  private refreshTokens: Map<string, { userId: string; clientId: string; expiresAt: Date }> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * OAuth2 授权端点
   * 显示登录/授权页面，用户确认后重定向回客户端
   */
  @Get('authorize')
  async authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('state') state: string,
    @Query('scope') scope: string,
    @Query('response_type') responseType: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.logger.log(`OAuth authorize request: client_id=${clientId}, redirect_uri=${redirectUri}, scope=${scope}`);
    
    // 验证 client_id（生产环境应查询数据库）
    const validClients = ['chatgpt', 'claude', 'gemini', 'agentrix-web', 'agentrix-mobile'];
    if (!validClients.includes(clientId)) {
      return res.status(400).json({ error: 'invalid_client', message: 'Unknown client_id' });
    }

    // 检查用户是否已登录（通过 cookie 或 session）
    const authToken = req.cookies?.['auth_token'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (authToken) {
      try {
        // 验证现有 token
        const payload = this.jwtService.verify(authToken);
        const user = await this.userRepository.findOne({ where: { id: payload.sub } });
        
        if (user) {
          // 用户已登录，直接生成授权码
          return this.issueAuthorizationCode(user, clientId, redirectUri, state, scope || 'all', res);
        }
      } catch (e) {
        // Token 无效，继续显示登录页面
      }
    }

    // 重定向到登录页面，带上 OAuth 参数
    const loginUrl = new URL(`${this.configService.get('FRONTEND_URL', 'https://agentrix.top')}/auth/oauth-login`);
    loginUrl.searchParams.set('client_id', clientId);
    loginUrl.searchParams.set('redirect_uri', redirectUri);
    loginUrl.searchParams.set('state', state || '');
    loginUrl.searchParams.set('scope', scope || 'all');
    loginUrl.searchParams.set('response_type', responseType || 'code');
    
    return res.redirect(loginUrl.toString());
  }

  /**
   * OAuth2 授权回调（用户登录成功后调用）
   */
  @Post('authorize/callback')
  async authorizeCallback(
    @Body('user_id') userId: string,
    @Body('client_id') clientId: string,
    @Body('redirect_uri') redirectUri: string,
    @Body('state') state: string,
    @Body('scope') scope: string,
    @Res() res: Response,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(400).json({ error: 'invalid_user', message: 'User not found' });
    }

    return this.issueAuthorizationCode(user, clientId, redirectUri, state, scope, res);
  }

  /**
   * OAuth2 令牌端点
   * 支持 authorization_code 和 refresh_token 两种 grant_type
   */
  @Post('token')
  async token(
    @Body('code') code: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('grant_type') grantType: string,
    @Body('refresh_token') refreshToken: string,
    @Body('redirect_uri') redirectUri: string,
  ) {
    this.logger.log(`OAuth token request: grant_type=${grantType}, client_id=${clientId}`);

    if (grantType === 'authorization_code') {
      return this.handleAuthorizationCodeGrant(code, clientId, clientSecret, redirectUri);
    } else if (grantType === 'refresh_token') {
      return this.handleRefreshTokenGrant(refreshToken, clientId, clientSecret);
    } else {
      return { error: 'unsupported_grant_type', message: 'Only authorization_code and refresh_token are supported' };
    }
  }

  /**
   * 用户信息端点
   */
  @Get('userinfo')
  async userinfo(@Req() req: Request) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { error: 'invalid_token', message: 'Missing or invalid Authorization header' };
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      
      if (!user) {
        return { error: 'invalid_token', message: 'User not found' };
      }

      return {
        sub: user.id,
        email: user.email,
        name: user.nickname || user.email,
        picture: user.avatarUrl,
        roles: user.roles,
      };
    } catch (e) {
      return { error: 'invalid_token', message: 'Token verification failed' };
    }
  }

  /**
   * 生成授权码并重定向
   */
  private issueAuthorizationCode(
    user: User,
    clientId: string,
    redirectUri: string,
    state: string,
    scope: string,
    res: Response,
  ) {
    // 生成安全的授权码
    const code = crypto.randomBytes(32).toString('hex');
    
    // 存储授权码（5分钟有效）
    const authCode: AuthorizationCode = {
      code,
      userId: user.id,
      clientId,
      redirectUri,
      scope,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
    this.authorizationCodes.set(code, authCode);

    // 重定向回客户端
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }

    this.logger.log(`Issuing authorization code for user ${user.id}, redirecting to ${callbackUrl.toString()}`);
    return res.redirect(callbackUrl.toString());
  }

  /**
   * 处理授权码换取令牌
   */
  private async handleAuthorizationCodeGrant(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
    const authCode = this.authorizationCodes.get(code);
    
    if (!authCode) {
      return { error: 'invalid_grant', message: 'Authorization code not found or expired' };
    }

    // 验证授权码
    if (authCode.clientId !== clientId) {
      return { error: 'invalid_grant', message: 'Client ID mismatch' };
    }

    if (authCode.redirectUri !== redirectUri) {
      return { error: 'invalid_grant', message: 'Redirect URI mismatch' };
    }

    if (new Date() > authCode.expiresAt) {
      this.authorizationCodes.delete(code);
      return { error: 'invalid_grant', message: 'Authorization code expired' };
    }

    // 删除已使用的授权码
    this.authorizationCodes.delete(code);

    // 获取用户
    const user = await this.userRepository.findOne({ where: { id: authCode.userId } });
    if (!user) {
      return { error: 'invalid_grant', message: 'User not found' };
    }

    // 生成 access_token 和 refresh_token
    return this.issueTokens(user, clientId, authCode.scope);
  }

  /**
   * 处理刷新令牌
   */
  private async handleRefreshTokenGrant(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ) {
    const tokenData = this.refreshTokens.get(refreshToken);
    
    if (!tokenData) {
      return { error: 'invalid_grant', message: 'Refresh token not found or expired' };
    }

    if (tokenData.clientId !== clientId) {
      return { error: 'invalid_grant', message: 'Client ID mismatch' };
    }

    if (new Date() > tokenData.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      return { error: 'invalid_grant', message: 'Refresh token expired' };
    }

    // 获取用户
    const user = await this.userRepository.findOne({ where: { id: tokenData.userId } });
    if (!user) {
      return { error: 'invalid_grant', message: 'User not found' };
    }

    // 删除旧的 refresh_token
    this.refreshTokens.delete(refreshToken);

    // 生成新的 tokens
    return this.issueTokens(user, clientId, 'all');
  }

  /**
   * 生成 access_token 和 refresh_token
   */
  private issueTokens(user: User, clientId: string, scope: string) {
    // 生成 access_token (1小时有效)
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        scope,
        client_id: clientId,
      },
      { expiresIn: '1h' },
    );

    // 生成 refresh_token (30天有效)
    const refreshToken = crypto.randomBytes(32).toString('hex');
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      clientId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope,
    };
  }
}
