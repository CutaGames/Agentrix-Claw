/**
 * OAuth 令牌安全属性验证 (spec soul-companion-onboarding, task P.3)。
 *
 * 覆盖 design.md 的两条 Correctness Property:
 *   - Property 6「令牌不外泄」(Validates: Requirements 6.8):
 *       任何代码路径都不把 access_token / refresh_token / 授权码 写入日志,
 *       也不把明文令牌写入 UserConnector.credentials;落库一律密文。
 *       · TokenCipher encrypt→decrypt 加解密往返保真(任意输入)。
 *       · 密文不包含明文子串(realistic token 生成器)。
 *       · 成功授权 + 刷新 + 撤销全流程,被捕获的 logger 从不收到任何令牌明文。
 *   - Property 7「OAuth 原子性」(Validates: Requirements 6.4):
 *       handleCallback 仅在成功换取 token 后才创建 UserConnector + OAuthToken;
 *       用户取消 / provider 错误 / 缺 code / 非法 state / 令牌换取失败 等路径
 *       不产生任何安装记录与令牌行。
 *
 * 测试手法(对齐 task 5.2 的 openclaw-proxy.memory.spec.ts):
 *   通过 `Object.create(prototype)` + 内存假仓储执行**真实**服务方法,绕开整张 DI 图,
 *   不依赖 Postgres。`CONNECTOR_TOKEN_KEY` 用固定 32 字节测试密钥初始化 TokenCipher,
 *   provider 凭据用固定测试值;`axios.post`(provider 令牌交换/撤销)被 mock。
 *
 * fast-check 运行次数按本任务约束保持较小(numRuns: 20),用于快速回归。
 *
 * **Validates: Requirements 6.4, 6.8**
 */

// provider 令牌交换 / 撤销走 axios.post — 在导入服务前 mock。
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import * as fc from 'fast-check';
import axios from 'axios';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

// 固定测试环境变量(TokenCipher 构造 + resolveProvider 需要),在导入/构造前设置。
process.env.CONNECTOR_TOKEN_KEY = 'unit-test-connector-token-key-32b!';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.test/v1/connectors/oauth/callback';

import { TokenCipher } from './token-cipher';
import { ConnectorOAuthService } from './connector-oauth.service';

const mockedPost = (axios as unknown as { post: jest.Mock }).post;

// ── 测试常量:含大写/下划线的「令牌样态」字符串,绝不会作为小写 hex 密文的子串 ──
const USER = 'user-oauth-1';
const CONNECTOR = 'google-calendar';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const ACCESS_TOKEN = 'ACCESS_TOKEN_SECRET_DO_NOT_LOG_a1b2c3d4e5';
const REFRESH_TOKEN = 'REFRESH_TOKEN_SECRET_DO_NOT_LOG_z9y8x7w6';
const REFRESHED_ACCESS = 'REFRESHED_ACCESS_TOKEN_SECRET_q1q2q3';
const AUTH_CODE = 'AUTHORIZATION_CODE_SECRET_kkk111';

// ── 内存假仓储:忠实复现服务用到的 findOne/create/save/remove ────────────
type AnyRow = Record<string, any>;

function makeRepo() {
  const rows: AnyRow[] = [];
  return {
    rows,
    findOne: jest.fn(async ({ where }: { where: AnyRow }) => {
      return (
        rows.find(
          (r) => r.userId === where.userId && r.connectorId === where.connectorId,
        ) ?? null
      );
    }),
    create: jest.fn((data: AnyRow) => ({ ...data })),
    save: jest.fn(async (row: AnyRow) => {
      const idx = rows.findIndex(
        (r) => r.userId === row.userId && r.connectorId === row.connectorId,
      );
      if (idx >= 0) rows[idx] = row;
      else rows.push(row);
      return row;
    }),
    remove: jest.fn(async (row: AnyRow) => {
      const idx = rows.indexOf(row);
      if (idx >= 0) rows.splice(idx, 1);
      return row;
    }),
  };
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * 用 prototype 实例 + 内存假仓储构造真实服务。
 * 注入一个「捕获型」logger:服务每次 this.logger.* 调用都被记录到 logCalls,
 * 用于断言「任何路径都不向日志写入令牌明文」。
 */
function makeService() {
  const connectorRepo = makeRepo();
  const tokenRepo = makeRepo();
  const cipher = new TokenCipher();
  const logCalls: string[] = [];
  const record = (...args: unknown[]) => {
    for (const a of args) logCalls.push(safeStr(a));
  };
  const logger = {
    log: record,
    warn: record,
    error: record,
    debug: record,
    verbose: record,
    fatal: record,
    setContext: () => undefined,
  };
  const service = Object.create(ConnectorOAuthService.prototype) as ConnectorOAuthService;
  (service as any).connectorRepo = connectorRepo;
  (service as any).tokenRepo = tokenRepo;
  (service as any).cipher = cipher;
  (service as any).logger = logger;
  return { service, connectorRepo, tokenRepo, cipher, logCalls };
}

/** 用服务自身的私有 signState 生成一个合法 state(HMAC 用 CONNECTOR_TOKEN_KEY 回退密钥)。 */
function signValidState(service: ConnectorOAuthService, userId: string, connectorId: string): string {
  return (service as any).signState({
    userId,
    connectorId,
    nonce: 'test-nonce-0001',
    ts: Date.now(),
  });
}

beforeEach(() => {
  mockedPost.mockReset();
});

// ════════════════════════════════════════════════════════════════════════
// Property 6: 令牌不外泄 (R6.8)
// ════════════════════════════════════════════════════════════════════════

describe('Property 6: TokenCipher 加解密往返与密文不含明文 (R6.8)', () => {
  it('decrypt(encrypt(x)) === x 对任意(非空)令牌字符串成立(往返保真)', () => {
    const cipher = new TokenCipher();
    // 输入空间约束:OAuth access_token / refresh_token 恒为非空字符串
    // (parseTokenResponse 拒绝缺失/空 access_token;refresh_token 仅在非空时加密),
    // 故 minLength:1 精确匹配 cipher 的真实输入空间。
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 300 }), (plaintext) => {
        const encrypted = cipher.encrypt(plaintext);
        expect(cipher.decrypt(encrypted)).toBe(plaintext);
      }),
      { numRuns: 20 },
    );
  });

  it('密文不包含明文令牌子串(令牌样态字符串)', () => {
    const cipher = new TokenCipher();
    // 令牌字符集含大写字母与 . _ ~ - 等字符;密文仅为小写 hex + ':',
    // 因此真实未泄漏时明文整体绝不会是密文子串。filter 保证至少一个非 hex/冒号字符,
    // 避免与小写 hex 巧合子串造成的误报(纯小写 hex 明文不是有意义的「泄漏」场景)。
    const tokenChars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~'.split('');
    const tokenArb = fc
      .array(fc.constantFrom(...tokenChars), { minLength: 8, maxLength: 200 })
      .map((chars) => chars.join(''))
      .filter((s) => /[A-Z._~-]/.test(s));

    fc.assert(
      fc.property(tokenArb, (token) => {
        const encrypted = cipher.encrypt(token);
        expect(encrypted).not.toContain(token);
        // 仍可解密回原文(确认未因「藏起明文」而破坏可逆性)。
        expect(cipher.decrypt(encrypted)).toBe(token);
      }),
      { numRuns: 20 },
    );
  });

  it('密文格式为 iv:enc:tag(全小写 hex),同一明文两次加密不同(IV 随机)', () => {
    const cipher = new TokenCipher();
    const a = cipher.encrypt(ACCESS_TOKEN);
    const b = cipher.encrypt(ACCESS_TOKEN);
    expect(a).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(b).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(a).not.toBe(b); // 随机 IV → 密文不同
    expect(cipher.decrypt(a)).toBe(ACCESS_TOKEN);
    expect(cipher.decrypt(b)).toBe(ACCESS_TOKEN);
  });

  it('CONNECTOR_TOKEN_KEY 缺失时构造即抛错(不回退默认密钥)', () => {
    const saved = process.env.CONNECTOR_TOKEN_KEY;
    delete process.env.CONNECTOR_TOKEN_KEY;
    try {
      expect(() => new TokenCipher()).toThrow(/CONNECTOR_TOKEN_KEY/);
    } finally {
      process.env.CONNECTOR_TOKEN_KEY = saved;
    }
  });
});

describe('Property 6: 授权全流程不向日志写入令牌明文 + credentials 不含明文 (R6.8)', () => {
  it('成功授权 → 刷新 → 撤销:落库为密文,日志与 credentials 均无令牌明文', async () => {
    const { service, connectorRepo, tokenRepo, cipher, logCalls } = makeService();

    // 1) 成功授权:provider 返回 access + refresh token。
    mockedPost.mockResolvedValue({
      data: {
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3600,
        scope: SCOPE,
      },
    });
    const state = signValidState(service, USER, CONNECTOR);
    const result = await service.handleCallback(AUTH_CODE, state);
    expect(result.ok).toBe(true);

    // 落库一律密文,且可解密回原文。
    const tokenRow = tokenRepo.rows[0];
    expect(tokenRow.accessTokenEnc).not.toContain(ACCESS_TOKEN);
    expect(tokenRow.refreshTokenEnc).not.toContain(REFRESH_TOKEN);
    expect(cipher.decrypt(tokenRow.accessTokenEnc)).toBe(ACCESS_TOKEN);
    expect(cipher.decrypt(tokenRow.refreshTokenEnc)).toBe(REFRESH_TOKEN);

    // UserConnector.credentials 只存非敏感元信息(authKind/scope),无任何令牌明文。
    const connRow = connectorRepo.rows[0];
    const credStr = safeStr(connRow.credentials);
    expect(credStr).not.toContain(ACCESS_TOKEN);
    expect(credStr).not.toContain(REFRESH_TOKEN);

    // 2) 刷新:令牌临期 → 用 refresh token 换新 access token,回写密文。
    tokenRow.expiresAt = new Date(Date.now() - 1000); // 已过期 → 触发刷新
    mockedPost.mockResolvedValue({
      data: { access_token: REFRESHED_ACCESS, expires_in: 3600 },
    });
    const at = await service.getValidAccessToken(USER, CONNECTOR);
    expect(at).toBe(REFRESHED_ACCESS);
    expect(tokenRow.accessTokenEnc).not.toContain(REFRESHED_ACCESS);
    expect(cipher.decrypt(tokenRow.accessTokenEnc)).toBe(REFRESHED_ACCESS);

    // 3) 撤销:best-effort 调 provider revoke + 删令牌 + 卸安装记录。
    mockedPost.mockResolvedValue({ data: {} });
    await service.revoke(USER, CONNECTOR);
    expect(tokenRepo.rows).toHaveLength(0);
    expect(connectorRepo.rows).toHaveLength(0);

    // 关键断言:整条链路产生过日志,但绝无任何令牌明文 / 授权码。
    const logBlob = logCalls.join('\n');
    expect(logCalls.length).toBeGreaterThan(0);
    expect(logBlob).not.toContain(ACCESS_TOKEN);
    expect(logBlob).not.toContain(REFRESH_TOKEN);
    expect(logBlob).not.toContain(REFRESHED_ACCESS);
    expect(logBlob).not.toContain(AUTH_CODE);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Property 7: OAuth 原子性 (R6.4)
// ════════════════════════════════════════════════════════════════════════

describe('Property 7: handleCallback 原子性 — 错误路径不建任何记录 (R6.4)', () => {
  it('用户取消(error=access_denied):抛描述性错误,不建安装/令牌记录', async () => {
    const { service, connectorRepo, tokenRepo } = makeService();
    await expect(
      service.handleCallback(undefined, undefined, 'access_denied'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(connectorRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.rows).toHaveLength(0);
    expect(connectorRepo.rows).toHaveLength(0);
    expect(mockedPost).not.toHaveBeenCalled(); // 未发起令牌交换
  });

  it('provider 返回错误(error=server_error):抛错,不建任何记录', async () => {
    const { service, connectorRepo, tokenRepo } = makeService();
    await expect(
      service.handleCallback('some-code', signValidState(service, USER, CONNECTOR), 'server_error'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(connectorRepo.save).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('缺少授权码(code 为空):抛错,不建任何记录', async () => {
    const { service, connectorRepo, tokenRepo } = makeService();
    await expect(
      service.handleCallback(undefined, signValidState(service, USER, CONNECTOR)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(connectorRepo.save).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('非法 state(CSRF 防护):抛错,不建任何记录且不发起令牌交换', async () => {
    const { service, connectorRepo, tokenRepo } = makeService();
    await expect(
      service.handleCallback('valid-code', 'tampered-state-without-valid-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(connectorRepo.save).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('令牌换取失败(provider/网络错误):抛错,不建任何记录', async () => {
    const { service, connectorRepo, tokenRepo } = makeService();
    mockedPost.mockRejectedValue(new Error('network down'));
    const state = signValidState(service, USER, CONNECTOR);

    await expect(service.handleCallback(AUTH_CODE, state)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // code 交换发起过,但失败 → 落库之前抛出 → 无 token 行、无安装记录。
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(connectorRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.rows).toHaveLength(0);
    expect(connectorRepo.rows).toHaveLength(0);
  });

  it('access_token 缺失的响应:抛错,不建任何记录', async () => {
    const { service, connectorRepo, tokenRepo } = makeService();
    mockedPost.mockResolvedValue({ data: { token_type: 'Bearer' } }); // 无 access_token
    const state = signValidState(service, USER, CONNECTOR);

    await expect(service.handleCallback(AUTH_CODE, state)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tokenRepo.save).not.toHaveBeenCalled();
    expect(connectorRepo.save).not.toHaveBeenCalled();
  });

  it('成功:换取 token 后才同时创建 OAuthToken 与 UserConnector,且 token 落库先于安装记录', async () => {
    const { service, connectorRepo, tokenRepo } = makeService();
    mockedPost.mockResolvedValue({
      data: {
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3600,
        scope: SCOPE,
      },
    });
    const state = signValidState(service, USER, CONNECTOR);

    const result = await service.handleCallback(AUTH_CODE, state);

    expect(result.ok).toBe(true);
    expect(result.installed).toBe(true);
    expect(tokenRepo.save).toHaveBeenCalledTimes(1);
    expect(connectorRepo.save).toHaveBeenCalledTimes(1);
    expect(tokenRepo.rows).toHaveLength(1);
    expect(connectorRepo.rows).toHaveLength(1);

    // 原子性顺序:先落令牌密文,再建安装记录 → 无有效 token 不会留下安装记录。
    const tokenOrder = tokenRepo.save.mock.invocationCallOrder[0];
    const connOrder = connectorRepo.save.mock.invocationCallOrder[0];
    expect(tokenOrder).toBeLessThan(connOrder);

    // 未授权连接器读取令牌应 401(对照:其它连接器无记录)。
    await expect(service.getValidAccessToken(USER, 'gmail')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
