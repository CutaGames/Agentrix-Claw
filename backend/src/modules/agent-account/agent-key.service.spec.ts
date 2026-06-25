import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger, ConflictException } from '@nestjs/common';
import { ethers } from 'ethers';

import { AgentKeyService } from './agent-key.service';
import { AgentAccount } from '../../entities/agent-account.entity';

/**
 * AgentKeyService 单测(crypto-native-agent-ops 任务 6,需求 7 F 组 · Property 10)。
 *
 * 覆盖:
 *  - 7.19 签发密钥对:publicKey + apiKeyPrefix 入库,apiSecretHash 仅存哈希(明文不落库)。
 *  - 7.21 secret 不可二次读取:明文仅签发时返回一次;重复签发(未轮换)被拒。
 *  - 7.20 验签失败拒绝:无公钥 / 签名不匹配 / 签名格式错误 → 拒绝并审计。
 *  - Property 10 密钥不入日志/回包:私钥 / secret 明文绝不出现在任何日志输出中。
 */

/** 内存仓库:用一个持久化对象模拟 AgentAccount 行。 */
function buildRepo(agent: AgentAccount | null) {
  const store = { agent };
  const repo: any = {
    findOne: jest.fn(async ({ where }: any) =>
      store.agent && store.agent.id === where.id ? store.agent : null,
    ),
    save: jest.fn(async (a: AgentAccount) => {
      store.agent = a;
      return a;
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        addSelect: jest.fn(() => qb),
        where: jest.fn(() => qb),
        getOne: jest.fn(async () => store.agent),
      };
      return qb;
    }),
  };
  return { repo, store };
}

function makeAgent(overrides: Partial<AgentAccount> = {}): AgentAccount {
  return {
    id: 'agent-1',
    agentUniqueId: 'AGT-TEST-1',
    name: 'Test Agent',
    ...overrides,
  } as AgentAccount;
}

async function buildService(repo: any): Promise<AgentKeyService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AgentKeyService,
      { provide: getRepositoryToken(AgentAccount), useValue: repo },
    ],
  }).compile();
  return module.get<AgentKeyService>(AgentKeyService);
}

describe('AgentKeyService', () => {
  /** 捕获所有日志输出,用于断言「密钥不入日志」(Property 10)。 */
  let logSpies: jest.SpyInstance[];
  let capturedLogs: string[];

  beforeEach(() => {
    capturedLogs = [];
    const capture = (...args: any[]) => {
      capturedLogs.push(args.map((a) => String(a)).join(' '));
    };
    logSpies = [
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture as any),
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture as any),
      jest.spyOn(Logger.prototype, 'error').mockImplementation(capture as any),
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(capture as any),
    ];
  });

  afterEach(() => {
    logSpies.forEach((s) => s.mockRestore());
    jest.clearAllMocks();
  });

  describe('issueKeys（7.19 + 7.21）', () => {
    it('生成密钥对:仅 publicKey + apiKeyPrefix + apiSecretHash 入库,明文不落库', async () => {
      const agent = makeAgent();
      const { repo, store } = buildRepo(agent);
      const service = await buildService(repo);

      const issued = await service.issueKeys('agent-1');

      // 一次性返回明文私钥 + secret。
      expect(issued.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(issued.apiSecret).toMatch(/^ak_[0-9a-f]{64}$/);
      expect(issued.publicKey).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(issued.apiKeyPrefix).toBe(`ak_${issued.apiSecret.slice(3, 9)}`);

      // 入库:公钥地址 + 前缀 + 哈希;绝不含明文私钥 / secret。
      const saved = store.agent!;
      expect(saved.publicKey).toBe(issued.publicKey);
      expect(saved.apiKeyPrefix).toBe(issued.apiKeyPrefix);
      expect(saved.apiSecretHash).toBeDefined();
      expect(saved.apiSecretHash).not.toBe(issued.apiSecret);
      const serialized = JSON.stringify(saved);
      expect(serialized).not.toContain(issued.privateKey);
      expect(serialized).not.toContain(issued.apiSecret);
    });

    it('secret 不可二次读取:已签发后重复 issueKeys（未轮换）被拒', async () => {
      const agent = makeAgent();
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const first = await service.issueKeys('agent-1');
      expect(first.apiSecret).toBeDefined();

      // 再次签发(未显式轮换)→ 冲突拒绝,无法再次拿到明文。
      await expect(service.issueKeys('agent-1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      // 服务上不存在任何「读取明文 secret」的方法。
      expect((service as any).getApiSecret).toBeUndefined();
      expect((service as any).getPrivateKey).toBeUndefined();
    });

    it('显式轮换 allowRotate=true 时签发新密钥(旧 secret 失效)', async () => {
      const agent = makeAgent();
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const first = await service.issueKeys('agent-1');
      const rotated = await service.issueKeys('agent-1', { allowRotate: true });

      expect(rotated.apiSecret).not.toBe(first.apiSecret);
      expect(rotated.publicKey).not.toBe(first.publicKey);
    });
  });

  describe('verifySignature（7.20）', () => {
    it('合法签名 → 通过', async () => {
      const wallet = ethers.Wallet.createRandom();
      const agent = makeAgent({ publicKey: wallet.address });
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const message = JSON.stringify({ action: 'pay', amount: 10 });
      const signature = await wallet.signMessage(message);

      const result = await service.verifySignature('agent-1', message, signature);
      expect(result.valid).toBe(true);
    });

    it('错误私钥签名 → 拒绝并审计', async () => {
      const owner = ethers.Wallet.createRandom();
      const attacker = ethers.Wallet.createRandom();
      const agent = makeAgent({ publicKey: owner.address });
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const message = JSON.stringify({ action: 'pay', amount: 10 });
      const signature = await attacker.signMessage(message);

      const result = await service.verifySignature('agent-1', message, signature);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('签名与公钥不匹配');
      // 审计:记录了拒绝事件。
      expect(capturedLogs.some((l) => l.includes('验签拒绝'))).toBe(true);
    });

    it('未注册公钥 → 拒绝', async () => {
      const agent = makeAgent({ publicKey: undefined });
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const result = await service.verifySignature('agent-1', 'msg', '0xdead');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('未注册公钥');
    });

    it('签名格式非法 → 拒绝(不抛异常)', async () => {
      const wallet = ethers.Wallet.createRandom();
      const agent = makeAgent({ publicKey: wallet.address });
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const result = await service.verifySignature(
        'agent-1',
        'msg',
        'not-a-valid-signature',
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('签名格式错误');
    });
  });

  describe('verifyApiSecret（7.20 携带凭证）', () => {
    it('正确 secret → 通过;错误 secret → 拒绝并审计', async () => {
      const agent = makeAgent();
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const issued = await service.issueKeys('agent-1');

      await expect(
        service.verifyApiSecret('agent-1', issued.apiSecret),
      ).resolves.toBe(true);
      await expect(
        service.verifyApiSecret('agent-1', 'ak_wrong'),
      ).resolves.toBe(false);
      expect(capturedLogs.some((l) => l.includes('验签拒绝'))).toBe(true);
    });
  });

  describe('Property 10：密钥不入日志/回包', () => {
    it('签发与验签全过程中,私钥/secret 明文绝不出现在任何日志输出', async () => {
      const agent = makeAgent();
      const { repo } = buildRepo(agent);
      const service = await buildService(repo);

      const issued = await service.issueKeys('agent-1');

      const message = JSON.stringify({ action: 'pay' });
      const signature = await new ethers.Wallet(issued.privateKey).signMessage(
        message,
      );
      await service.verifySignature('agent-1', message, signature);
      await service.verifyApiSecret('agent-1', issued.apiSecret);
      await service.verifyApiSecret('agent-1', 'ak_wrong'); // 触发审计

      // 所有日志(log/warn/error/debug)都不得包含私钥或 secret 明文。
      const allLogs = capturedLogs.join('\n');
      expect(allLogs).not.toContain(issued.privateKey);
      expect(allLogs).not.toContain(issued.apiSecret);
      // 前缀(非机密)出现在签发日志中是允许的。
      expect(allLogs).toContain(issued.apiKeyPrefix);
    });
  });
});
