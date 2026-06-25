import { deriveEconomicIdentityStatus } from './agent-economic-status';
import { AgentAccount, AgentRiskLevel } from '../../entities/agent-account.entity';

/**
 * 前台可信展示(H 组)单测 —— 经济身份「真实状态」派生。
 *
 * 覆盖:
 *  - 需求 7.25:钱包/限额/信用/链上身份/能力的真实状态枚举与后端字段一致;
 *  - 未落地项标 `not_enabled`(显式「未启用」)而非空占位;
 *  - 失败标记 → `failed`。
 */
describe('deriveEconomicIdentityStatus (H 组 — 真实状态)', () => {
  const base = (over: Partial<AgentAccount> = {}): AgentAccount =>
    ({
      id: 'agent-1',
      creditScore: 500,
      riskLevel: AgentRiskLevel.MEDIUM,
      usedTodayAmount: 0,
      usedMonthAmount: 0,
      capabilities: undefined,
      spendingLimits: undefined,
      ...over,
    } as AgentAccount);

  it('全空白 agent:各维度均为 not_enabled,无空占位', () => {
    const s = deriveEconomicIdentityStatus(base());
    expect(s.wallet.status).toBe('not_enabled');
    expect(s.wallet.type).toBe('none');
    expect(s.limit.status).toBe('not_enabled');
    expect(s.credit.status).toBe('not_enabled');
    expect(s.onchain.status).toBe('not_enabled');
    expect(s.capabilities.status).toBe('not_enabled');
    expect(s.capabilities.declared).toEqual([]);
    expect(s.capabilities.count).toBe(0);
  });

  it('MPC 钱包绑定 → wallet.enabled + type=mpc,字段一致', () => {
    const s = deriveEconomicIdentityStatus(base({ mpcWalletId: 'mpc-123' }));
    expect(s.wallet.status).toBe('enabled');
    expect(s.wallet.type).toBe('mpc');
    expect(s.wallet.mpcWalletId).toBe('mpc-123');
  });

  it('外部钱包 → wallet.enabled + type=external', () => {
    const s = deriveEconomicIdentityStatus(base({ externalWalletAddress: '0xabc' }));
    expect(s.wallet.status).toBe('enabled');
    expect(s.wallet.type).toBe('external');
    expect(s.wallet.externalWalletAddress).toBe('0xabc');
  });

  it('钱包绑定失败标记 → wallet.failed', () => {
    const s = deriveEconomicIdentityStatus(base({ metadata: { walletBindingFailed: true } }));
    expect(s.wallet.status).toBe('failed');
  });

  it('配置限额 → limit.enabled,且与后端字段一致', () => {
    const s = deriveEconomicIdentityStatus(
      base({
        spendingLimits: { singleTxLimit: 100, dailyLimit: 200, monthlyLimit: 1000, currency: 'USDC' },
        usedTodayAmount: 30,
        usedMonthAmount: 90,
      }),
    );
    expect(s.limit.status).toBe('enabled');
    expect(s.limit.dailyLimit).toBe(200);
    expect(s.limit.monthlyLimit).toBe(1000);
    expect(s.limit.currency).toBe('USDC');
    expect(s.limit.usedTodayAmount).toBe(30);
    expect(s.limit.usedMonthAmount).toBe(90);
  });

  it('限额全 0 → not_enabled', () => {
    const s = deriveEconomicIdentityStatus(
      base({ spendingLimits: { singleTxLimit: 0, dailyLimit: 0, monthlyLimit: 0, currency: 'USDC' } }),
    );
    expect(s.limit.status).toBe('not_enabled');
  });

  it('信用已被真实评分(creditScoreUpdatedAt 有值)→ credit.enabled', () => {
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const s = deriveEconomicIdentityStatus(
      base({ creditScore: 720, riskLevel: AgentRiskLevel.LOW, creditScoreUpdatedAt: updatedAt }),
    );
    expect(s.credit.status).toBe('enabled');
    expect(s.credit.creditScore).toBe(720);
    expect(s.credit.riskLevel).toBe(AgentRiskLevel.LOW);
    expect(s.credit.creditScoreUpdatedAt).toBe(updatedAt.toISOString());
  });

  it('仅默认初始分(无 creditScoreUpdatedAt)→ credit.not_enabled,不误导', () => {
    const s = deriveEconomicIdentityStatus(base({ creditScore: 500 }));
    expect(s.credit.status).toBe('not_enabled');
    expect(s.credit.creditScore).toBe(500);
  });

  it('链上身份已注册 + session 未过期 → onchain.enabled + sessionActive', () => {
    const s = deriveEconomicIdentityStatus(
      base({
        erc8004SessionId: 'sess-1',
        easAttestationUid: 'eas-1',
        registrationChain: 'bsc-testnet',
        sessionExpiry: new Date(Date.now() + 86_400_000),
      }),
    );
    expect(s.onchain.status).toBe('enabled');
    expect(s.onchain.erc8004SessionId).toBe('sess-1');
    expect(s.onchain.easAttestationUid).toBe('eas-1');
    expect(s.onchain.chain).toBe('bsc-testnet');
    expect(s.onchain.sessionActive).toBe(true);
  });

  it('链上注册失败标记 → onchain.failed', () => {
    const s = deriveEconomicIdentityStatus(base({ metadata: { onchainRegistrationFailed: true } }));
    expect(s.onchain.status).toBe('failed');
  });

  it('链上注册降级 metadata.onchainIdentity.status=failed → onchain.failed', () => {
    const s = deriveEconomicIdentityStatus(base({ metadata: { onchainIdentity: { status: 'failed' } } }));
    expect(s.onchain.status).toBe('failed');
  });

  it('声明 capabilities → capabilities.enabled + declared 列表与后端一致', () => {
    const s = deriveEconomicIdentityStatus(base({ capabilities: ['skill_search', 'get_balance'] }));
    expect(s.capabilities.status).toBe('enabled');
    expect(s.capabilities.declared).toEqual(['skill_search', 'get_balance']);
    expect(s.capabilities.count).toBe(2);
  });
});
