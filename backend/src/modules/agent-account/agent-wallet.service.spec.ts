import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ethers } from 'ethers';
import { BadRequestException, ConflictException } from '@nestjs/common';

import {
  AgentWalletService,
  MPC_WALLET_PROVIDER,
  MpcWalletProvider,
  PlaceholderMpcWalletProvider,
} from './agent-wallet.service';
import {
  AgentAccount,
  AgentAccountStatus,
} from '../../entities/agent-account.entity';
import {
  Account,
  AccountOwnerType,
  AccountWalletType,
} from '../../entities/account.entity';

/**
 * AgentWalletService 单测(crypto-native-agent-ops 任务 5,需求 7 D 组)。
 *
 * 覆盖:
 *  - 7.13 验签通过/失败:`verifyAddressOwnership` + `bindExternalWallet`。
 *  - 7.12 托管钱包:provider 创建后写回 `mpcWalletId`。
 *  - 7.15 绑定/创建失败回滚不留半写:provider 失败 / 事务内 save 失败 → agent 保持安全态。
 *  - 7.14 `defaultAccountId` 与 Account 双向一致:`setDefaultAccount` / `verifyDefaultAccountConsistency`。
 *
 * 仓库测试约定(沿用 agent-account.service.spec):无测试库,用 getRepositoryToken 注入 mock,
 * `manager.transaction(cb)` 直接执行回调;通过「committed 副本 + 事务内 clone」忠实模拟回滚:
 * 回调抛错时已提交状态不变(模拟 ROLLBACK)。
 */

/** 构造一个真实 EVM 签名(地址归属证明)。 */
async function makeSignedMessage(message: string) {
  const wallet = ethers.Wallet.createRandom();
  const signature = await wallet.signMessage(message);
  return { address: wallet.address, signature };
}

/**
 * 构建一个可控的内存仓库 + 事务环境。
 *
 * - `committedAgent` / `committedAccounts`:已提交(持久化)状态。
 * - 事务内 `getRepository().findOne` 返回 committed 的深拷贝(clone);
 *   `save` 仅在事务回调成功结束后才把 clone 合并回 committed(由 transaction 包装实现)。
 *   若回调中途抛错 → committed 不变(ROLLBACK)。
 */
function buildHarness(opts: {
  agent: AgentAccount;
  accounts?: Account[];
  /** 让事务内对 AgentAccount 的 save 抛错,模拟写回失败。 */
  failAgentSave?: boolean;
}) {
  let committedAgent: AgentAccount = { ...opts.agent };
  let committedAccounts: Account[] = (opts.accounts || []).map((a) => ({ ...a }));

  const cloneAgent = () => ({ ...committedAgent } as AgentAccount);
  const cloneAccounts = () => committedAccounts.map((a) => ({ ...a }));

  const makeTxRepos = (staging: {
    agent: AgentAccount | null;
    accounts: Account[];
  }) => {
    const agentRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        staging.agent && staging.agent.id === where.id ? staging.agent : null,
      ),
      save: jest.fn(async (a: AgentAccount) => {
        if (opts.failAgentSave) {
          throw new Error('simulated agent save failure');
        }
        staging.agent = a;
        return a;
      }),
    };
    const accountRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.id) {
          return staging.accounts.find((a) => a.id === where.id) || null;
        }
        if (where.walletAddress) {
          return (
            staging.accounts.find(
              (a) => a.walletAddress === where.walletAddress,
            ) || null
          );
        }
        return null;
      }),
      find: jest.fn(async ({ where }: any) =>
        staging.accounts.filter(
          (a) => a.ownerId === where.ownerId && a.ownerType === where.ownerType,
        ),
      ),
      create: jest.fn((data: any) => ({ id: `acc-${Date.now()}`, ...data })),
      save: jest.fn(async (a: Account) => {
        const idx = staging.accounts.findIndex((x) => x.id === a.id);
        if (idx >= 0) staging.accounts[idx] = a;
        else staging.accounts.push(a);
        return a;
      }),
    };
    return { agentRepo, accountRepo };
  };

  const manager = {
    transaction: jest.fn(async (cb: (m: any) => Promise<void>) => {
      // 事务内 staging = committed 的拷贝
      const staging = { agent: cloneAgent(), accounts: cloneAccounts() };
      const { agentRepo, accountRepo } = makeTxRepos(staging);
      const m = {
        getRepository: (entity: any) =>
          entity === AgentAccount ? agentRepo : accountRepo,
      };
      // 回调抛错 → 不提交(ROLLBACK)
      await cb(m);
      // 成功 → 提交
      committedAgent = staging.agent!;
      committedAccounts = staging.accounts;
    }),
  };

  const agentAccountRepository = {
    findOne: jest.fn(async ({ where }: any) =>
      committedAgent && committedAgent.id === where.id ? cloneAgent() : null,
    ),
    manager,
  };

  const accountRepository = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id) {
        return committedAccounts.find((a) => a.id === where.id) || null;
      }
      if (where.walletAddress) {
        return (
          committedAccounts.find(
            (a) => a.walletAddress === where.walletAddress,
          ) || null
        );
      }
      return null;
    }),
  };

  return {
    agentAccountRepository,
    accountRepository,
    getCommittedAgent: () => committedAgent,
    getCommittedAccounts: () => committedAccounts,
  };
}

const makeAgent = (over: Partial<AgentAccount> = {}): AgentAccount =>
  ({
    id: 'agent-1',
    agentUniqueId: 'AGT-1',
    ownerId: 'owner-1',
    status: AgentAccountStatus.ACTIVE,
    mpcWalletId: undefined,
    externalWalletAddress: undefined,
    defaultAccountId: undefined,
    ...over,
  } as AgentAccount);

const makeAccount = (over: Partial<Account> = {}): Account =>
  ({
    id: 'acc-1',
    accountId: 'ACC-AGENT-1',
    ownerId: 'agent-1',
    ownerType: AccountOwnerType.AGENT,
    walletType: AccountWalletType.VIRTUAL,
    isDefault: false,
    ...over,
  } as Account);

async function buildService(harness: ReturnType<typeof buildHarness>, provider: MpcWalletProvider) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AgentWalletService,
      { provide: getRepositoryToken(AgentAccount), useValue: harness.agentAccountRepository },
      { provide: getRepositoryToken(Account), useValue: harness.accountRepository },
      { provide: MPC_WALLET_PROVIDER, useValue: provider },
    ],
  }).compile();
  return module.get<AgentWalletService>(AgentWalletService);
}

const okProvider: MpcWalletProvider = {
  name: 'test',
  createWallet: jest.fn(async () => ({
    walletId: '0xMPCWALLET',
    address: '0xMPCWALLET',
    chain: 'BSC',
    provider: 'test',
  })),
};

describe('AgentWalletService — 外部钱包验签 (7.13)', () => {
  it('verifyAddressOwnership 返回 true 当签名地址匹配', async () => {
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, okProvider);

    const { address, signature } = await makeSignedMessage('bind to agent-1');
    expect(service.verifyAddressOwnership(address, 'bind to agent-1', signature)).toBe(true);
  });

  it('verifyAddressOwnership 返回 false 当签名地址不匹配', async () => {
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, okProvider);

    const { signature } = await makeSignedMessage('bind to agent-1');
    const other = ethers.Wallet.createRandom().address;
    expect(service.verifyAddressOwnership(other, 'bind to agent-1', signature)).toBe(false);
  });

  it('verifyAddressOwnership 返回 false 当签名串非法(异常吞没)', async () => {
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, okProvider);
    expect(service.verifyAddressOwnership('0xabc', 'msg', 'not-a-signature')).toBe(false);
  });

  it('bindExternalWallet 验签通过 → 写入 externalWalletAddress', async () => {
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, okProvider);

    const { address, signature } = await makeSignedMessage('own agent-1');
    const updated = await service.bindExternalWallet('agent-1', {
      walletAddress: address,
      message: 'own agent-1',
      signature,
    });

    expect(updated.externalWalletAddress).toBe(address);
    expect(harness.getCommittedAgent().externalWalletAddress).toBe(address);
    // 同时创建了一个非托管账户
    const created = harness.getCommittedAccounts().find((a) => a.walletAddress === address);
    expect(created).toBeDefined();
    expect(created!.walletType).toBe(AccountWalletType.NON_CUSTODIAL);
  });

  it('bindExternalWallet 验签失败 → 拒绝且不写入(7.13/7.15)', async () => {
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, okProvider);

    const { signature } = await makeSignedMessage('own agent-1');
    const wrongAddress = ethers.Wallet.createRandom().address;

    await expect(
      service.bindExternalWallet('agent-1', {
        walletAddress: wrongAddress,
        message: 'own agent-1',
        signature,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // 未写入任何状态
    expect(harness.getCommittedAgent().externalWalletAddress).toBeUndefined();
    expect(harness.getCommittedAccounts()).toHaveLength(0);
  });

  it('bindExternalWallet 地址重复 → 冲突且回滚(7.15)', async () => {
    const dup = ethers.Wallet.createRandom();
    const harness = buildHarness({
      agent: makeAgent(),
      accounts: [makeAccount({ id: 'acc-dup', walletAddress: dup.address })],
    });
    const service = await buildService(harness, okProvider);

    const signature = await dup.signMessage('own agent-1');
    await expect(
      service.bindExternalWallet('agent-1', {
        walletAddress: dup.address,
        message: 'own agent-1',
        signature,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.getCommittedAgent().externalWalletAddress).toBeUndefined();
    // 仍只有原始那一个账户,未新增半写
    expect(harness.getCommittedAccounts()).toHaveLength(1);
  });
});

describe('AgentWalletService — 托管钱包 (7.12) 与失败回滚 (7.15)', () => {
  it('enableManagedWallet 创建成功 → 写回 mpcWalletId', async () => {
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, okProvider);

    const updated = await service.enableManagedWallet('agent-1');
    expect(updated.mpcWalletId).toBe('0xMPCWALLET');
    expect(harness.getCommittedAgent().mpcWalletId).toBe('0xMPCWALLET');
  });

  it('enableManagedWallet 同步默认托管账户 mpcWalletId(7.14 一致性)', async () => {
    const harness = buildHarness({
      agent: makeAgent({ defaultAccountId: 'acc-1' }),
      accounts: [makeAccount({ id: 'acc-1', walletType: AccountWalletType.VIRTUAL })],
    });
    const service = await buildService(harness, okProvider);

    await service.enableManagedWallet('agent-1');
    const acc = harness.getCommittedAccounts().find((a) => a.id === 'acc-1');
    expect(acc!.mpcWalletId).toBe('0xMPCWALLET');
    expect(acc!.walletType).toBe(AccountWalletType.CUSTODIAL);
  });

  it('enableManagedWallet provider 创建失败 → agent 保持无钱包安全态(7.15)', async () => {
    const failingProvider: MpcWalletProvider = {
      name: 'failing',
      createWallet: jest.fn(async () => {
        throw new Error('provider down');
      }),
    };
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, failingProvider);

    await expect(service.enableManagedWallet('agent-1')).rejects.toThrow('provider down');
    expect(harness.getCommittedAgent().mpcWalletId).toBeUndefined();
  });

  it('enableManagedWallet 写回阶段失败 → 事务回滚不留半写(7.15)', async () => {
    const harness = buildHarness({ agent: makeAgent(), failAgentSave: true });
    const service = await buildService(harness, okProvider);

    await expect(service.enableManagedWallet('agent-1')).rejects.toThrow();
    // provider 已建钱包,但写回失败 → agent 仍无 mpcWalletId(安全态)
    expect(harness.getCommittedAgent().mpcWalletId).toBeUndefined();
  });

  it('enableManagedWallet 已有 mpcWalletId → 冲突拒绝', async () => {
    const harness = buildHarness({ agent: makeAgent({ mpcWalletId: '0xEXISTING' }) });
    const service = await buildService(harness, okProvider);
    await expect(service.enableManagedWallet('agent-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AgentWalletService — defaultAccountId 双向一致 (7.14)', () => {
  it('setDefaultAccount 设置后双向一致', async () => {
    const harness = buildHarness({
      agent: makeAgent(),
      accounts: [
        makeAccount({ id: 'acc-1', isDefault: false }),
        makeAccount({ id: 'acc-2', isDefault: true }),
      ],
    });
    const service = await buildService(harness, okProvider);

    const updated = await service.setDefaultAccount('agent-1', 'acc-1');
    expect(updated.defaultAccountId).toBe('acc-1');

    const accounts = harness.getCommittedAccounts();
    expect(accounts.find((a) => a.id === 'acc-1')!.isDefault).toBe(true);
    // 唯一默认:其它被置 false
    expect(accounts.find((a) => a.id === 'acc-2')!.isDefault).toBe(false);

    await expect(service.verifyDefaultAccountConsistency('agent-1')).resolves.toBe(true);
  });

  it('setDefaultAccount 账户不属于此 agent → 拒绝且回滚', async () => {
    const harness = buildHarness({
      agent: makeAgent(),
      accounts: [makeAccount({ id: 'acc-x', ownerId: 'other-agent' })],
    });
    const service = await buildService(harness, okProvider);

    await expect(service.setDefaultAccount('agent-1', 'acc-x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(harness.getCommittedAgent().defaultAccountId).toBeUndefined();
  });

  it('verifyDefaultAccountConsistency 当 defaultAccountId 指向账户非默认 → false', async () => {
    const harness = buildHarness({
      agent: makeAgent({ defaultAccountId: 'acc-1' }),
      accounts: [makeAccount({ id: 'acc-1', isDefault: false })],
    });
    const service = await buildService(harness, okProvider);
    await expect(service.verifyDefaultAccountConsistency('agent-1')).resolves.toBe(false);
  });

  it('verifyDefaultAccountConsistency 无 defaultAccountId → false', async () => {
    const harness = buildHarness({ agent: makeAgent() });
    const service = await buildService(harness, okProvider);
    await expect(service.verifyDefaultAccountConsistency('agent-1')).resolves.toBe(false);
  });
});

describe('PlaceholderMpcWalletProvider', () => {
  it('MPCWalletService 不可用 → 显式抛错(降级显式 Property 8)', async () => {
    const provider = new PlaceholderMpcWalletProvider(undefined);
    await expect(
      provider.createWallet({ agentId: 'agent-1', ownerId: 'owner-1' }),
    ).rejects.toThrow();
  });

  it('复用 MPCWalletService 创建钱包并返回 walletId', async () => {
    const mpc: any = {
      generateMPCWalletForUser: jest.fn(async () => ({ walletAddress: '0xABC' })),
    };
    const provider = new PlaceholderMpcWalletProvider(mpc);
    const result = await provider.createWallet({ agentId: 'a', ownerId: 'o', chain: 'BSC' });
    expect(result.walletId).toBe('0xABC');
    expect(result.address).toBe('0xABC');
    expect(mpc.generateMPCWalletForUser).toHaveBeenCalled();
  });
});
