import { Controller, Post, Body, UseGuards, Request, BadRequestException, Get, Res, Delete, Param, ParseEnumPipe, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SocialAccountService } from './social-account.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto, LoginDto, WalletLoginDto, BindSocialAccountDto } from './dto/auth.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { SocialAccountType } from '../../entities/social-account.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private socialAccountService: SocialAccountService,
    private configService: ConfigService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 400, description: '用户已存在' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth 登录' })
  async googleAuth() {
    // Guard 会自动重定向到 Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth 回调' })
  async googleAuthCallback(@Request() req, @Res() res: Response) {
    try {
      // 检查req.user是否存在
      if (!req.user) {
        throw new BadRequestException('Google OAuth认证失败：未获取到用户信息');
      }

      const { googleId, email, firstName, lastName, picture } = req.user;
      const profileData = {
        email,
        displayName: firstName && lastName ? `${firstName} ${lastName}` : undefined,
        avatarUrl: picture,
      };

      // 检查是否已有用户通过Google登录（查找SocialAccount）
      let user = await this.socialAccountService.findUserBySocialId(
        SocialAccountType.GOOGLE,
        googleId,
      );

      if (!user) {
        // 如果没有，检查是否通过email找到用户（用于绑定）
        if (email) {
          user = await this.authService.findUserByEmail(email);
        }

        if (user) {
          // 如果找到用户，绑定Google账号
          await this.socialAccountService.bindSocialAccount(
            user.id,
            SocialAccountType.GOOGLE,
            googleId,
            profileData,
          );
        } else {
          // 创建新用户
          user = await this.authService.validateGoogleUser(req.user);
          await this.socialAccountService.bindSocialAccount(
            user.id,
            SocialAccountType.GOOGLE,
            googleId,
            profileData,
          );
        }
      }

      const loginResult = await this.authService.login(user);
      
      // 获取前端 URL
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') || req.headers.origin || 'http://localhost:3000';
      
      // 将 token 和用户信息通过 URL 参数传递给前端
      const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
      redirectUrl.searchParams.set('token', loginResult.access_token);
      redirectUrl.searchParams.set('userId', loginResult.user.id);
      redirectUrl.searchParams.set('email', loginResult.user.email || '');
      redirectUrl.searchParams.set('agentrixId', loginResult.user.agentrixId);
      
      res.redirect(redirectUrl.toString());
    } catch (error) {
      // 获取前端 URL
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') || req.headers.origin || 'http://localhost:3000';
      const errorUrl = new URL(`${frontendUrl}/auth/callback`);
      errorUrl.searchParams.set('error', error.message || 'Google登录失败');
      res.redirect(errorUrl.toString());
    }
  }

  @Post('wallet/login')
  @ApiOperation({ summary: '钱包登录' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '签名验证失败' })
  async walletLogin(@Body() dto: WalletLoginDto) {
    return this.authService.walletLogin(dto);
  }

  @Post('wallet/bind')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '绑定新的链上钱包到当前账号' })
  @ApiResponse({ status: 201, description: '绑定成功' })
  @ApiResponse({ status: 409, description: '钱包已绑定其他账号' })
  async bindWallet(@Request() req, @Body() dto: WalletLoginDto) {
    return this.authService.bindWallet(req.user.id, dto);
  }

  @Get('wallet/connections')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户绑定的钱包' })
  @ApiResponse({ status: 200, description: '钱包列表返回成功' })
  async getWalletConnections(@Request() req) {
    return this.authService.getWalletConnections(req.user.id);
  }

  @Delete('wallet/connections/:walletId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '解绑钱包' })
  @ApiResponse({ status: 200, description: '解绑成功' })
  async removeWalletConnection(
    @Request() req,
    @Param('walletId', new ParseUUIDPipe()) walletId: string,
  ) {
    return this.authService.removeWalletConnection(req.user.id, walletId);
  }

  @Post('wallet/connections/:walletId/default')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置默认钱包' })
  @ApiResponse({ status: 200, description: '设置成功' })
  async setDefaultWallet(
    @Request() req,
    @Param('walletId', new ParseUUIDPipe()) walletId: string,
  ) {
    return this.authService.setDefaultWallet(req.user.id, walletId);
  }

  // ========== 社交账号绑定 ==========

  @Post('social/bind')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '绑定社交账号' })
  @ApiResponse({ status: 201, description: '绑定成功' })
  @ApiResponse({ status: 409, description: '该类型账号已绑定或已被其他用户绑定' })
  async bindSocialAccount(
    @Request() req,
    @Body() body: BindSocialAccountDto,
  ) {
    const { type, socialId, email, username, displayName, avatarUrl, metadata } = body;
    return this.socialAccountService.bindSocialAccount(
      req.user.id,
      type,
      socialId,
      {
        email,
        username,
        displayName,
        avatarUrl,
        metadata,
      },
    );
  }

  @Delete('social/unbind/:type')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '解绑社交账号' })
  @ApiResponse({ status: 200, description: '解绑成功' })
  @ApiResponse({ status: 404, description: '未找到该社交账号绑定' })
  async unbindSocialAccount(
    @Request() req,
    @Param('type', new ParseEnumPipe(SocialAccountType)) type: SocialAccountType,
  ) {
    return this.socialAccountService.unbindSocialAccount(req.user.id, type);
  }

  @Get('social/accounts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户的社交账号绑定列表' })
  @ApiResponse({ status: 200, description: '返回社交账号列表' })
  async getUserSocialAccounts(@Request() req) {
    return this.socialAccountService.getUserSocialAccounts(req.user.id);
  }
}

