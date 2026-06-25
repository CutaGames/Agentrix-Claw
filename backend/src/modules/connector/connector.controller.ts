import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { ConnectorService } from './connector.service';
import { ConnectorOAuthService } from './connector-oauth.service';
import {
  CalendarEmailReadoutService,
  type ReadoutOptions,
} from './calendar-email-readout.service';
import type {
  ConnectorInstallInput,
  ConnectorInstallResult,
  CalendarEmailReadout,
} from '../../../../shared/types/connector';

/**
 * ConnectorController — 连接器/插件库 API。`v1/connectors`。
 *   GET    /v1/connectors                       目录(含已安装标记)
 *   GET    /v1/connectors/installed             我已安装
 *   POST   /v1/connectors/install               一键安装(鉴权向导提交;oauth 类返回 needsOAuth+authorizeUrl)
 *   DELETE /v1/connectors/:id                   卸载
 *   POST   /v1/connectors/:id/run               直接执行 builtin 连接器(查询类)
 *   POST   /v1/connectors/:id/errand            派 agent 出门办事(玩法 A:办成→发 AXP+世界新闻)
 *   GET    /v1/connectors/:id/oauth/authorize-url  生成 OAuth 授权跳转 URL + 签名 state(R6.2)
 *   GET    /v1/connectors/oauth/callback        provider 授权回调(Public,内部 state 校验,R6.2/R6.4)
 *   GET    /v1/connectors/:id/readout           当天日程/未读读取(R4.3/R6.5)
 *   DELETE /v1/connectors/:id/oauth             撤销 OAuth 授权(R6.7)
 */
@ApiTags('connectors')
@Controller('v1/connectors')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConnectorController {
  constructor(
    private readonly connectors: ConnectorService,
    private readonly oauth: ConnectorOAuthService,
    private readonly readout: CalendarEmailReadoutService,
  ) {}

  private uid(req: any): string {
    return req.user?.id || req.user?.sub;
  }
  private uname(req: any): string {
    return req.user?.name || req.user?.displayName || req.user?.email || '居民';
  }

  @Get()
  @ApiOperation({ summary: '连接器目录' })
  async catalog(@Request() req: any) {
    return { items: await this.connectors.catalog(this.uid(req)) };
  }

  @Get('installed')
  @ApiOperation({ summary: '我已安装的连接器' })
  async installed(@Request() req: any) {
    return { items: await this.connectors.listInstalled(this.uid(req)) };
  }

  @Post('install')
  @ApiOperation({ summary: '一键安装连接器' })
  async install(@Request() req: any, @Body() body: ConnectorInstallInput) {
    if (!body?.connectorId) throw new BadRequestException('connectorId 必填');
    return this.connectors.install(this.uid(req), body);
  }

  // ── OAuth 授权链路(R6) ───────────────────────────────────────────

  /**
   * 生成 OAuth 授权跳转 URL + 签名 state(R6.2)。
   * 前端拿到 url 后跳转 provider 授权页;回调时校验 state 防 CSRF。
   * 注意:此路由置于 `:id/run`、`:id/errand` 之前不影响匹配(三段路径,literal `oauth`)。
   */
  @Get(':id/oauth/authorize-url')
  @ApiOperation({ summary: '生成 OAuth 授权跳转 URL(带签名 state)' })
  async oauthAuthorizeUrl(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<{ url: string; state: string }> {
    return this.oauth.authorizeUrl(this.uid(req), id);
  }

  /**
   * OAuth provider 回调(R6.2/R6.4)。provider 跳回时无 Bearer,故 `@Public()`;
   * 鉴权完全依赖签名 state 校验(在 ConnectorOAuthService.handleCallback 内完成)。
   * 用户取消 / provider error / state 非法 → 抛描述性错误,不创建安装记录。
   */
  @Public()
  @Get('oauth/callback')
  @ApiOperation({ summary: 'OAuth 授权回调(Public,内部 state 校验)' })
  async oauthCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<ConnectorInstallResult> {
    return this.oauth.handleCallback(code, state, error);
  }

  /**
   * 撤销 OAuth 授权(R6.7):删除持久化令牌、卸载连接器、best-effort 通知 provider。
   */
  @Delete(':id/oauth')
  @ApiOperation({ summary: '撤销 OAuth 授权' })
  async oauthRevoke(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<{ ok: boolean }> {
    return this.oauth.revoke(this.uid(req), id);
  }

  // ── 当天日程/未读读取(R4.3/R6.5) ────────────────────────────────

  /**
   * 读取某连接器的当天概览(今日日程数 / 未读邮件数)(R4.3/R6.5)。
   * query:
   *   - tzOffsetMinutes:计算「今日」边界的时区偏移(UTC 以东分钟数,如北京/新加坡 480)。
   *   - clientCount / clientItems:system-calendar 端侧本地读取后回传的计数与标题。
   */
  @Get(':id/readout')
  @ApiOperation({ summary: '读取当天日程/未读' })
  async readoutToday(
    @Request() req: any,
    @Param('id') id: string,
    @Query('tzOffsetMinutes') tzOffsetMinutes?: string,
    @Query('clientCount') clientCount?: string,
    @Query('clientItems') clientItems?: string | string[],
  ): Promise<CalendarEmailReadout> {
    const options: ReadoutOptions = {};
    if (tzOffsetMinutes != null && tzOffsetMinutes !== '') {
      const tz = Number(tzOffsetMinutes);
      if (Number.isFinite(tz)) options.tzOffsetMinutes = tz;
    }
    if (clientCount != null && clientCount !== '') {
      const cc = Number(clientCount);
      if (Number.isFinite(cc)) options.clientCount = cc;
    }
    if (clientItems != null) {
      options.clientItems = Array.isArray(clientItems) ? clientItems : [clientItems];
    }
    return this.readout.todaySummary(this.uid(req), id, options);
  }

  @Delete(':id')
  @ApiOperation({ summary: '卸载连接器' })
  async uninstall(@Request() req: any, @Param('id') id: string) {
    return this.connectors.uninstall(this.uid(req), id);
  }

  @Post(':id/run')
  @ApiOperation({ summary: '执行 builtin 连接器(查询类)' })
  async run(@Request() req: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.connectors.runBuiltin(id, body ?? {});
  }

  @Post(':id/errand')
  @ApiOperation({ summary: '派 agent 出门办事(办成发 AXP + 世界新闻)' })
  async errand(@Request() req: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.connectors.runErrand(this.uid(req), id, body ?? {}, this.uname(req));
  }
}
