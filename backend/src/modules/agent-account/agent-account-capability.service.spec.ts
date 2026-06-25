import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';

import { AgentAccountService } from './agent-account.service';
import { AgentAccount, AgentAccountStatus, AgentRiskLevel } from '../../entities/agent-account.entity';
import { AgentSpendingRecord } from '../../entities/agent-spending-record.entity';
import { Account } from '../../entities/account.entity';
import { EasService } from '../agent/eas.service';
import { MPCWalletService } from '../mpc-wallet/mpc-wallet.service';
import { PayMindRelayerService } from '../relayer/relayer.service';

/**
 * AgentAccountService 能力门控(G 组)+ 经济身份状态(H 组)单测。
 *
 * 覆盖:
 *  - 需求 7.22:assertToolDeclared 拒绝未声明工具(声明即门控)。
 *  - 需求 7.25:getEconomicIdentityStatus 返回与后端字段一致的状态枚举。
 */
describe('AgentAccountService — 能力门控(G)+ 经济状态(H)', () => {
  let service: AgentAccountService;
  let agent: AgentAccount;

  const mockAgentRepo = {
    findOne: jest.fn(async () => agent),
    save: jest.fn(async (a: AgentAccount) => a),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    agent = {
      id: 'agent-1',
      status: AgentAccountStatus.ACTIVE,
      creditScore: 500,
      riskLevel: AgentRiskLevel.MEDIUM,
      usedTodayAmount: 0,
      usedMonthAmount: 0,
      capabilities: ['skill_search', 'get_balance', 'mcp_*'],
    } as AgentAccount;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentAccountService,
        { provide: getRepositoryToken(AgentAccount), useValue: mockAgentRepo },
        { provide: getRepositoryToken(Account), useValue: {} },
        { provide: getRepositoryToken(AgentSpendingRecord), useValue: {} },
        { provide: EasService, useValue: null },
        { provide: MPCWalletService, useValue: null },
        { provide: PayMindRelayerService, useValue: null },
      ],
    }).compile();

    service = module.get<AgentAccountService>(AgentAccountService);
  });

  describe('assertToolDeclared (7.22 声明即门控)', () => {
    it('已声明工具 → 通过', async () => {
      await expect(service.assertToolDeclared('agent-1', 'skill_search')).resolves.toBeUndefined();
    });

    it('通配声明覆盖的工具 → 通过', async () => {
      await expect(service.assertToolDeclared('agent-1', 'mcp_github_issue')).resolves.toBeUndefined();
    });

    it('未声明工具 → 抛 ForbiddenException(被拒)', async () => {
      await expect(service.assertToolDeclared('agent-1', 'quickpay_execute')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('capabilities 为空 → deny-by-default,任何工具被拒', async () => {
      agent.capabilities = [];
      await expect(service.assertToolDeclared('agent-1', 'skill_search')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('isToolAllowed 与 assert 一致(不抛,返回布尔)', async () => {
      await expect(service.isToolAllowed('agent-1', 'get_balance')).resolves.toBe(true);
      await expect(service.isToolAllowed('agent-1', 'x402_pay')).resolves.toBe(false);
    });
  });

  describe('getEconomicIdentityStatus (7.25 真实状态)', () => {
    it('返回各维度状态枚举,能力维度与后端 capabilities 一致', async () => {
      const s = await service.getEconomicIdentityStatus('agent-1');
      expect(s.capabilities.status).toBe('enabled');
      expect(s.capabilities.declared).toEqual(['skill_search', 'get_balance', 'mcp_*']);
      // 未落地维度显式 not_enabled,而非空占位
      expect(s.wallet.status).toBe('not_enabled');
      expect(s.limit.status).toBe('not_enabled');
      expect(s.credit.status).toBe('not_enabled');
      expect(s.onchain.status).toBe('not_enabled');
    });
  });
});
