import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { UserConnector } from './user-connector.entity';
import { OAuthToken } from './oauth-token.entity';
import { TokenCipher } from './token-cipher';
import type { ConnectorInstallResult } from '../../../../shared/types/connector';

/**
 * ConnectorOAuthService — 日历/邮箱等 OAuth 连接器的鉴权链路(净新建,R6)。
 *
 * 职责:
 *   - authorizeUrl(userId, connectorId) → 生成 provider 授权 URL + 带签名 state(防 CSRF)。
 *   - handleCallback(code, state, error) → 校验 state、用 code 换 token、加密落库;
 *     仅在成功换取 token 后才创建 UserConnector(原子性,R6.4/Property 7)。
 *   - getValidAccessToken(userId, connectorId) → 读令牌,临期且有 refresh token 则自动刷新回写(R6.3)。
 *   - revoke(userId, connectorId) → provider revoke(best-effort)+ 删令牌 + 卸 UserConnector(R6.7)。
 *
 * 安全:
 *   - access_token / refresh_token 经 TokenCipher(AES-256-GCM)加密落 connector_oauth_tokens(R6.8)。
 *   - state = base64url(payload).hmac,payload = { userId, connectorId, nonce, ts };
 *     回调严格校验签名 + 时效,失败即拒(R6.4,防 CSRF / 开放重定向)。
 *   - 日志只记 connectorId + userId + 成功/失败;令牌明文、邮件正文、日程标题绝不写日志(R6.8)。
 *
 * 说明:provider 配置(授权/令牌/撤销端点、scope、env 变量名)由本服务内置 OAUTH_PROVIDERS 维护,
 * 不依赖 connector-catalog 的 oauth 元信息(目录条目由 task 1.3 单独补齐),保持本服务自洽。
 */

/** 单个 OAuth provider 的静态配置(端点 + scope + 读取凭据的 env 变量名)。 */
interface OAuthProviderDef {
  /** provider 标识(同一 provider 多连接器共用凭据,如 google)。 */
  provider: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint?: string;
  /** 最小只读 scope(R6 安全:只读不写)。 */
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectUriEnv: string;
  /** 授权 URL 附加参数(如 Google 拿 refresh token 需 access_type=offline)。 */
  authParams?: Record<string, string>;
}

/** resolveProvider 解析后的运行期配置(已注入环境凭据)。 */
interface ResolvedProvider extends OAuthProviderDef {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';

/** 内置 OAuth provider 配置表(connectorId → provider 配置)。 */
const OAUTH_PROVIDERS: Record<string, OAuthProviderDef> = {
  'google-calendar': {
    provider: 'google',
    authorizeEndpoint: GOOGLE_AUTHORIZE,
    tokenEndpoint: GOOGLE_TOKEN,
    revokeEndpoint: GOOGLE_REVOKE,
    // 最小权限:仅读日历(R6 安全)。
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    redirectUriEnv: 'GOOGLE_OAUTH_REDIRECT_URI',
    authParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
  gmail: {
    provider: 'google',
    authorizeEndpoint: GOOGLE_AUTHORIZE,
    tokenEndpoint: GOOGLE_TOKEN,
    revokeEndpoint: GOOGLE_REVOKE,
    // 最小权限:仅读邮件(R6 安全)。
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    redirectUriEnv: 'GOOGLE_OAUTH_REDIRECT_URI',
    authParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
};

/** state 有效期(10 分钟):超时拒绝,降低重放/CSRF 窗口。 */
const STATE_TTL_MS = 10 * 60 * 1000;
/** 访问令牌临期阈值(60s):剩余有效期小于此值即用 refresh token 刷新。 */
const REFRESH_SKEW_MS = 60 * 1000;

interface StatePayload {
  userId: string;
  connectorId: string;
  nonce: string;
  ts: number;
}

@Injectable()
export class ConnectorOAuthService {
  private readonly logger = new Logger(ConnectorOAuthService.name);

  constructor(
    @InjectRepository(UserConnector)
    private readonly connectorRepo: Repository<UserConnector>,
    @InjectRepository(OAuthToken)
    private readonly tokenRepo: Repository<OAuthToken>,
    private readonly cipher: TokenCipher,
  ) {}

  /**
   * 生成授权跳转 URL + 签名 state(R6.2)。
   * 前端拿到 url 后跳转到 provider 授权页;state 在回调时校验防 CSRF。
   */
  authorizeUrl(userId: string, connectorId: string): { url: string; state: string } {
    const provider = this.resolveProvider(connectorId);
    const state = this.signState({
      userId,
      connectorId,
      nonce: randomBytes(16).toString('hex'),
      ts: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      response_type: 'code',
      scope: provider.scopes.join(' '),
      state,
      ...(provider.authParams ?? {}),
    });

    this.logger.log(`oauth authorize-url issued connector=${connectorId} user=${userId}`);
    return { url: `${provider.authorizeEndpoint}?${params.toString()}`, state };
  }

  /**
   * 处理 provider 回调(R6.2/R6.4/Property 7)。
   *   - 用户取消 / provider error(error 非空)→ 抛描述性错误,不建任何安装记录。
   *   - state 校验失败 → 抛错(防 CSRF),不建记录。
   *   - code 换 token 失败 → 抛错,不建记录。
   *   - 成功 → 先加密落 OAuthToken,再建/启用 UserConnector(kind=oauth)。
   */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    error?: string,
  ): Promise<ConnectorInstallResult> {
    // 用户取消或 provider 返回错误:描述性错误,绝不创建安装记录(R6.4)。
    if (error) {
      throw new BadRequestException(`OAuth 授权被取消或失败:${error}`);
    }
    if (!code) {
      throw new BadRequestException('OAuth 回调缺少授权码(code)');
    }

    // 校验签名 state(防 CSRF);失败抛错,不建记录。
    const payload = this.verifyState(state);
    const { userId, connectorId } = payload;
    const provider = this.resolveProvider(connectorId);

    // 用 code 换 access/refresh token。任何失败都在落库之前抛出 → 不产生安装记录。
    let tokens: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: Date | null;
      scope: string | null;
    };
    try {
      tokens = await this.exchangeCode(provider, code);
    } catch (e: any) {
      // 仅记 connectorId/user/状态,绝不记 code 或令牌(R6.8)。
      this.logger.warn(`oauth code exchange failed connector=${connectorId} user=${userId}`);
      throw new BadRequestException('OAuth 令牌换取失败,请重试授权');
    }

    // 成功:加密落库(R6.8 密文存储)。
    await this.persistToken(userId, connectorId, tokens);

    // 仅在 token 成功落库后才创建/启用 UserConnector(原子性,R6.4/Property 7)。
    const existing = await this.connectorRepo.findOne({ where: { userId, connectorId } });
    const row = existing ?? this.connectorRepo.create({ userId, connectorId });
    row.enabled = true;
    // credentials 只存非敏感元信息;敏感 token 在 connector_oauth_tokens(R6.8)。
    row.credentials = { authKind: 'oauth', scope: tokens.scope ?? null };
    await this.connectorRepo.save(row);

    this.logger.log(`oauth connector installed connector=${connectorId} user=${userId}`);
    return {
      ok: true,
      connectorId,
      installed: true,
      message: '授权成功',
    };
  }

  /**
   * 取一个可用的访问令牌(R6.3)。
   * 若令牌临期且存在 refresh token,则用 refresh token 刷新并加密回写,返回新令牌。
   * 未授权(无令牌行)抛 401。
   */
  async getValidAccessToken(userId: string, connectorId: string): Promise<string> {
    const row = await this.tokenRepo.findOne({ where: { userId, connectorId } });
    if (!row) {
      throw new UnauthorizedException('该连接器尚未授权');
    }

    const needsRefresh =
      !!row.expiresAt && row.expiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;

    if (needsRefresh && row.refreshTokenEnc) {
      const provider = this.resolveProvider(connectorId);
      let refreshToken: string;
      try {
        refreshToken = this.cipher.decrypt(row.refreshTokenEnc);
      } catch {
        throw new UnauthorizedException('授权令牌已失效,请重新授权');
      }
      let refreshed: {
        accessToken: string;
        refreshToken: string | null;
        expiresAt: Date | null;
        scope: string | null;
      };
      try {
        refreshed = await this.refreshAccessToken(provider, refreshToken);
      } catch (e: any) {
        this.logger.warn(`oauth token refresh failed connector=${connectorId} user=${userId}`);
        throw new UnauthorizedException('刷新授权令牌失败,请重新授权');
      }
      // 刷新通常不返回新 refresh token → 保留原值。
      row.accessTokenEnc = this.cipher.encrypt(refreshed.accessToken);
      if (refreshed.refreshToken) {
        row.refreshTokenEnc = this.cipher.encrypt(refreshed.refreshToken);
      }
      row.expiresAt = refreshed.expiresAt;
      if (refreshed.scope) row.scope = refreshed.scope;
      await this.tokenRepo.save(row);
      this.logger.log(`oauth token refreshed connector=${connectorId} user=${userId}`);
      return refreshed.accessToken;
    }

    try {
      return this.cipher.decrypt(row.accessTokenEnc);
    } catch {
      throw new UnauthorizedException('授权令牌已失效,请重新授权');
    }
  }

  /**
   * 撤销授权(R6.7):best-effort 调 provider revoke,删除本地令牌,卸载 UserConnector。
   * 之后该连接器的数据访问将因无令牌而失败。
   */
  async revoke(userId: string, connectorId: string): Promise<{ ok: boolean }> {
    const row = await this.tokenRepo.findOne({ where: { userId, connectorId } });

    if (row) {
      const provider = OAUTH_PROVIDERS[connectorId];
      if (provider?.revokeEndpoint) {
        try {
          const accessToken = this.cipher.decrypt(row.accessTokenEnc);
          await this.revokeAtProvider(provider, accessToken);
        } catch {
          // best-effort:provider 撤销失败不阻断本地清除(R6.7)。
          this.logger.warn(`oauth provider revoke best-effort failed connector=${connectorId} user=${userId}`);
        }
      }
      await this.tokenRepo.remove(row);
    }

    // 卸载安装记录,停止后续数据访问(R6.7)。
    const connectorRow = await this.connectorRepo.findOne({ where: { userId, connectorId } });
    if (connectorRow) await this.connectorRepo.remove(connectorRow);

    this.logger.log(`oauth connector revoked connector=${connectorId} user=${userId}`);
    return { ok: true };
  }

  // ── 内部:provider 解析 ───────────────────────────────────────────

  /** 解析连接器对应的 provider 配置 + 注入环境凭据;不支持/未配置时抛描述性错误。 */
  private resolveProvider(connectorId: string): ResolvedProvider {
    const base = OAUTH_PROVIDERS[connectorId];
    if (!base) {
      throw new BadRequestException(`连接器「${connectorId}」不支持 OAuth 授权`);
    }
    // 连接器专用凭据优先;对 google provider,未配 GOOGLE_OAUTH_* 时回退到
    // 登录用的 GOOGLE_CLIENT_ID/SECRET(同一个 Google OAuth client 可同时服务
    // 登录与连接器,只需在 Google Console 给该 client 追加连接器回调 URI)。
    const isGoogle = base.provider === 'google';
    const placeholderish = (v?: string) => !v || v.startsWith('placeholder-');

    let clientId = process.env[base.clientIdEnv];
    if (placeholderish(clientId) && isGoogle) clientId = process.env.GOOGLE_CLIENT_ID;

    let clientSecret = process.env[base.clientSecretEnv];
    if (placeholderish(clientSecret) && isGoogle) clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // redirect URI:专用变量优先;否则用 API_BASE_URL 拼连接器回调(与 §5.5 端点一致)。
    let redirectUri = process.env[base.redirectUriEnv];
    if (!redirectUri) {
      const apiBase = (process.env.API_BASE_URL || 'https://api.agentrix.top/api').replace(/\/$/, '');
      redirectUri = `${apiBase}/v1/connectors/oauth/callback`;
    }

    if (placeholderish(clientId) || placeholderish(clientSecret) || !redirectUri) {
      // 仍无可用凭据:引导用户改用兜底连接器(system-calendar / imap-email)。
      throw new BadRequestException(
        `「${connectorId}」OAuth 暂未配置,请改用系统日历或 IMAP 邮箱兜底连接器`,
      );
    }
    return { ...base, clientId, clientSecret, redirectUri };
  }

  // ── 内部:state 签名 / 校验(防 CSRF)──────────────────────────────

  /** state 签名密钥:专用密钥优先,回退到令牌加密密钥(两者均不入日志)。 */
  private stateSecret(): string {
    const secret = process.env.CONNECTOR_OAUTH_STATE_SECRET || process.env.CONNECTOR_TOKEN_KEY;
    if (!secret || secret.trim().length === 0) {
      throw new BadRequestException('OAuth state 签名密钥未配置');
    }
    return secret;
  }

  /** 生成签名 state:base64url(payload).hmac。 */
  private signState(payload: StatePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.stateSecret()).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  /** 校验签名 state:HMAC 匹配 + 未过期;失败抛描述性错误(R6.4)。 */
  private verifyState(state: string | undefined): StatePayload {
    if (!state || typeof state !== 'string' || !state.includes('.')) {
      throw new BadRequestException('OAuth state 无效');
    }
    const [body, sig] = state.split('.');
    if (!body || !sig) {
      throw new BadRequestException('OAuth state 无效');
    }
    const expected = createHmac('sha256', this.stateSecret()).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new BadRequestException('OAuth state 校验失败');
    }
    let payload: StatePayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('OAuth state 解析失败');
    }
    if (
      !payload ||
      typeof payload.userId !== 'string' ||
      typeof payload.connectorId !== 'string' ||
      typeof payload.ts !== 'number'
    ) {
      throw new BadRequestException('OAuth state 内容非法');
    }
    if (Date.now() - payload.ts > STATE_TTL_MS) {
      throw new BadRequestException('OAuth state 已过期,请重新发起授权');
    }
    return payload;
  }

  // ── 内部:provider 令牌交换 / 刷新 / 撤销 ──────────────────────────

  /** 用授权码换 access/refresh token。 */
  private async exchangeCode(
    provider: ResolvedProvider,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null; scope: string | null }> {
    const params = new URLSearchParams({
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: provider.redirectUri,
      grant_type: 'authorization_code',
    });
    const resp = await axios.post(provider.tokenEndpoint, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
    return this.parseTokenResponse(resp.data);
  }

  /** 用 refresh token 刷新 access token。 */
  private async refreshAccessToken(
    provider: ResolvedProvider,
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null; scope: string | null }> {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      grant_type: 'refresh_token',
    });
    const resp = await axios.post(provider.tokenEndpoint, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
    return this.parseTokenResponse(resp.data);
  }

  /** best-effort 调 provider revoke 端点撤销令牌。 */
  private async revokeAtProvider(provider: OAuthProviderDef, accessToken: string): Promise<void> {
    if (!provider.revokeEndpoint) return;
    const params = new URLSearchParams({ token: accessToken });
    await axios.post(provider.revokeEndpoint, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
  }

  /** 解析 provider 令牌响应为内部结构;access_token 缺失视为失败。 */
  private parseTokenResponse(data: any): {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    scope: string | null;
  } {
    const accessToken = data?.access_token;
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('token response missing access_token');
    }
    const expiresInSec = typeof data?.expires_in === 'number' ? data.expires_in : null;
    return {
      accessToken,
      refreshToken: typeof data?.refresh_token === 'string' ? data.refresh_token : null,
      expiresAt: expiresInSec != null ? new Date(Date.now() + expiresInSec * 1000) : null,
      scope: typeof data?.scope === 'string' ? data.scope : null,
    };
  }

  /** 加密并幂等落库 OAuthToken((userId, connectorId) 唯一)。 */
  private async persistToken(
    userId: string,
    connectorId: string,
    tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date | null; scope: string | null },
  ): Promise<void> {
    const existing = await this.tokenRepo.findOne({ where: { userId, connectorId } });
    const row = existing ?? this.tokenRepo.create({ userId, connectorId });
    row.accessTokenEnc = this.cipher.encrypt(tokens.accessToken);
    // refresh token 可能仅首次授权下发;无新值时保留既有密文。
    if (tokens.refreshToken) {
      row.refreshTokenEnc = this.cipher.encrypt(tokens.refreshToken);
    } else if (!existing) {
      row.refreshTokenEnc = null;
    }
    row.expiresAt = tokens.expiresAt;
    row.scope = tokens.scope;
    await this.tokenRepo.save(row);
  }
}
