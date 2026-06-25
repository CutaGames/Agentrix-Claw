import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';

import {
  AgentOnchainIdentityService,
  DEFAULT_ONCHAIN_CHAIN,
  MAINNET_ENABLED_FLAG,
} from './agent-onchain-identity.service';
import { EasService } from '../agent/eas.service';
import { AgentAuthorizationService } from '../agent-authorization/agent-authorization.service';
import { PayMindRelayerService } from '../relayer/relayer.service';
import {
  AgentAccount,
  AgentAccountStatus,
  AgentRiskLevel,
} from '../../entities/agent-account.entity';

/**
 * AgentOnchainIdentityService 单测(crypto-native-agent-ops 任务 8,需求 7 E 组)。
 *
 * 覆盖:
 *  - 7.16/7.17 注册成功写回字段:erc8004SessionId/sessionExpiry/onchainRegistrationTxHash/
 *    registrationChain/easAttestationUid。
 *  - 7.18 失败降级显式不阻塞(Property 8):链上路径全失败 → mode=offchain、downgraded=true、
 *    metadata.onchainIdentity.status='failed',且不抛错、不写链上字段。
 *  - 主网为显式开关:未开 flag 请求主网链被拒;开 flag 后放行;默认链为 bsc-testnet。
 */

function makeAgent(overrides: Partial<AgentAccount> = {}): AgentAccount {
  return {
    id: 'agent-1',
    agentUniqueId: 'AGT-TEST-1',
    name: 'Test Agent',
    ownerId: 'owner-1',
    status: AgentAccountStatus.ACTIVE,
    riskLevel: AgentRiskLevel.MEDIUM,
    mpcWalletId: '0xabc0000000000000000000000000000000000001',
    externalWalletAddress: undefined,
    spendingLimits: {
      singleTxLimit: 100,
      dailyLimit: 500,
      monthlyLimit: 5000,
      currency: 'USDC',
    },
    metadata: undefined,
    easAttestationUid: undefined,
    erc8004SessionId: undefined,
    sessionExpiry: undefined,
    onchainRegistrationTxHash: undefined,
    registrationChain: undefined,
    ...overrides,
  } as AgentAccount;
}

interface HarnessOpts {
  agent: AgentAccount;
  easUid?: string | null;
  easThrows?: boolean;
  authThrows?: boolean;
  withAuth?: boolean;
  withRelayer?: boolean;
  mainnetEnabled?: boolean;
  defaultChain?: string;
}

async function buildService(opts: HarnessOpts) {
  const saved: AgentAccount[] = [];

  const repo = {
    findOne: jest.fn(async ({ where }: any) =>
      where.id === opts.agent.id ? opts.agent : null,
    ),
    save: jest.fn(async (a: AgentAccount) => {
      saved.push({ ...a });
      return a;
    }),
  };

  const easService = {
    attestAgentRegistration: jest.fn(async () => {
      if (opts.easThrows) throw new Error('eas boom');
      return opts.easUid === undefined ? 'eas-uid-123' : opts.easUid;
    }),
  };

  const agentAuthorization = {
    ensureErc8004Authorization: jest.fn(async (params: any) => {
      if (opts.authThrows) throw new Error('auth boom');
      return { id: 'auth-1', ...params };
    }),
  };

  const relayer = {};

  const configService = {
    get: jest.fn((key: string) => {
      if (key === MAINNET_ENABLED_FLAG) {
        return opts.mainnetEnabled ? 'true' : 'false';
      }
      if (key === 'AGENT_ONCHAIN_DEFAULT_CHAIN') {
        return opts.defaultChain;
      }
      return undefined;
    }),
  };

  const providers: any[] = [
    AgentOnchainIdentityService,
    { provide: getRepositoryToken(AgentAccount), useValue: repo },
    { provide: EasService, useValue: easService },
    { provide: ConfigService, useValue: configService },
  ];
  if (opts.withAuth !== false) {
    providers.push({ provide: AgentAuthorizationService, useValue: agentAuthorization });
  }
  if (opts.withRelayer) {
    providers.push({ provide: PayMindRelayerService, useValue: relayer });
  }

  const moduleRef: TestingModule = await Test.createTestingModule({ providers }).compile();
  const service = moduleRef.get(AgentOnchainIdentityService);
  return { service, repo, easService, agentAuthorization, configService, saved };
}

describe('AgentOnchainIdentityService', () => {
  describe('注册写回字段 (7.16 / 7.17)', () => {
    it('成功注册 → 写回 erc8004/EAS/链/tx/expiry 字段,mode=onchain', async () => {
      const agent = makeAgent();
      const { service } = await buildService({ agent, withRelayer: true });

      const result = await service.registerOnchainIdentity('agent-1');

      expect(result.mode).toBe('onchain');
      expect(result.downgraded).toBe(false);
      expect(result.chain).toBe(DEFAULT_ONCHAIN_CHAIN);
      expect(result.easAttestationUid).toBe('eas-uid-123');
      expect(result.erc8004SessionId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.onchainRegistrationTxHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.sessionExpiry).toBeDefined();
      expect(result.gasSponsored).toBe(true);

      // 实体字段确实被写回。
      expect(agent.easAttestationUid).toBe('eas-uid-123');
      expect(agent.erc8004SessionId).toBe(result.erc8004SessionId);
      expect(agent.registrationChain).toBe(DEFAULT_ONCHAIN_CHAIN);
      expect(agent.sessionExpiry).toBeInstanceOf(Date);
      expect(agent.onchainRegistrationTxHash).toBe(result.onchainRegistrationTxHash);
      expect(agent.metadata?.onchainIdentity?.status).toBe('verified');
    });

    it('重复注册被拒 (已存在链上身份)', async () => {
      const agent = makeAgent({ erc8004SessionId: '0xexisting' });
      const { service } = await buildService({ agent });
      await expect(service.registerOnchainIdentity('agent-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('非活跃 agent 被拒', async () => {
      const agent = makeAgent({ status: AgentAccountStatus.SUSPENDED });
      const { service } = await buildService({ agent });
      await expect(service.registerOnchainIdentity('agent-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('失败降级不阻塞 (7.18 / Property 8)', () => {
    it('EAS 失败 + ERC-8004 失败 → 显式降级链下,不抛错且不写链上字段', async () => {
      const agent = makeAgent();
      const { service } = await buildService({
        agent,
        easUid: null,
        authThrows: true,
      });

      const result = await service.registerOnchainIdentity('agent-1');

      expect(result.mode).toBe('offchain');
      expect(result.downgraded).toBe(true);
      expect(result.downgradeReason).toBeTruthy();
      // 不静默伪装:链上字段保持空。
      expect(agent.easAttestationUid).toBeUndefined();
      expect(agent.erc8004SessionId).toBeUndefined();
      expect(agent.onchainRegistrationTxHash).toBeUndefined();
      // 显式标注失败态(供前台 H 组派生)。
      expect(agent.metadata?.onchainIdentity?.status).toBe('failed');
      expect(agent.metadata?.onchainIdentity?.reason).toBeTruthy();
    });

    it('无签名地址且 EAS 失败 → 降级链下', async () => {
      const agent = makeAgent({
        mpcWalletId: undefined,
        externalWalletAddress: undefined,
      });
      const { service } = await buildService({ agent, easThrows: true });

      const result = await service.registerOnchainIdentity('agent-1');
      expect(result.mode).toBe('offchain');
      expect(result.downgraded).toBe(true);
    });

    it('EAS 成功但 ERC-8004 失败 → 仍为 onchain(部分),写回 EAS', async () => {
      const agent = makeAgent();
      const { service } = await buildService({ agent, authThrows: true });

      const result = await service.registerOnchainIdentity('agent-1');
      expect(result.mode).toBe('onchain');
      expect(result.easAttestationUid).toBe('eas-uid-123');
      expect(result.erc8004SessionId).toBeUndefined();
      expect(agent.metadata?.onchainIdentity?.status).toBe('partial');
    });
  });

  describe('主网为显式开关', () => {
    it('默认链为 bsc-testnet,无需开关', async () => {
      const agent = makeAgent();
      const { service } = await buildService({ agent });
      expect(service.resolveChain()).toBe(DEFAULT_ONCHAIN_CHAIN);
      expect(service.resolveChain('bsc-testnet')).toBe('bsc-testnet');
    });

    it('未开开关请求主网链 → 拒绝 (显式开关)', async () => {
      const agent = makeAgent();
      const { service } = await buildService({ agent, mainnetEnabled: false });
      expect(() => service.resolveChain('bsc-mainnet')).toThrow(BadRequestException);
      expect(() => service.resolveChain('ethereum')).toThrow(BadRequestException);
      expect(service.isMainnetEnabled()).toBe(false);
    });

    it('开启开关后请求主网链 → 放行', async () => {
      const agent = makeAgent();
      const { service } = await buildService({ agent, mainnetEnabled: true });
      expect(service.isMainnetEnabled()).toBe(true);
      expect(service.resolveChain('bsc-mainnet')).toBe('bsc-mainnet');
    });

    it('注册主网链未开开关 → 抛错而非降级 (不静默上主网)', async () => {
      const agent = makeAgent();
      const { service } = await buildService({ agent, mainnetEnabled: false });
      await expect(
        service.registerOnchainIdentity('agent-1', { chain: 'bsc-mainnet' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      // 未发生任何写回。
      expect(agent.metadata).toBeUndefined();
    });
  });
});
