import {
  Injectable,
  Logger,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import {
  AgentAccount,
  AgentAccountStatus,
} from '../../entities/agent-account.entity';
import {
  Account,
  AccountOwnerType,
  AccountWalletType,
  AccountChainType,
  AccountStatus,
} from '../../entities/account.entity';
import { MPCWalletService } from '../mpc-wallet/mpc-wallet.service';

/**
 * 托管钱包(MPC)供应商适配器接口。
 *
 * spec: crypto-native-agent-ops 需求 7.12 · design §C1 D 组。
 *
 * 实现待选 Fireblocks / Circle / Turnkey 等;默认提供占位实现
 * （`PlaceholderMpcWalletProvider`,复用既有 `MPCWalletService` 本地 MPC 分片钱包）。
 * 后续接入真实托管方时,只需实现本接口并替换 provider 绑定,
 * `AgentWalletService` 上层逻辑(写回 + 回滚 + 一致性)无需改动。
 */
export interface MpcWalletProvider {
  /** 供应商名称(占位 = 'placeholder';真实如 'fireblocks'/'circle'/'turnkey')。 */
  readonly name: string;

  /**
   * 为 agent 创建一个托管 MPC 钱包。
   * 失败时 SHALL 抛错(由上层 `AgentWalletService` 回滚,保持 agent「无钱包可用」安全态)。
   */
  createWallet(params: MpcWalletCreateParams): Promise<MpcWalletCreateResult>;
}

export interface MpcWalletCreateParams {
  agentId: string;
  /** agent 所有者(占位实现复用既有 user-scoped MPC 创建)。 */
  ownerId?: string;
  /** 目标链(默认 BSC)。 */
  chain?: string;
}

export interface MpcWalletCreateResult {
  /** 写入 `AgentAccount.mpcWalletId` 的标识(占位实现用钱包地址)。 */
  walletId: string;
  /** 钱包地址。 */
  address: string;
  /** 实际创建所在链。 */
  chain: string;
  /** 创建该钱包的供应商名称。 */
  provider: string;
}

/** DI token,便于按环境替换 MPC 供应商实现。 */
export const MPC_WALLET_PROVIDER = 'MPC_WALLET_PROVIDER';

/**
 * 默认占位 MPC 供应商实现。
 *
 * 复用既有 `MPCWalletService`(Shamir 分片本地 MPC 钱包),
 * 在真实托管方(Fireblocks/Circle/Turnkey)接入前作为可用占位。
 * 若 `MPCWalletService` 不可用 → 显式抛 `ServiceUnavailableException`
 *（对应 Property 8「降级显式」,绝不静默伪装可用)。
 */
@Injectable()
export class PlaceholderMpcWalletProvider implements MpcWalletProvider {
  readonly name = 'placeholder';
  private readonly logger = new Logger(PlaceholderMpcWalletProvider.name);

  constructor(
    @Optional() @Inject(MPCWalletService)
    private readonly mpcWalletService?: MPCWalletService,
  ) {}

  async createWallet(
    params: MpcWalletCreateParams,
  ): Promise<MpcWalletCreateResult> {
    const chain = params.chain || 'BSC';

    if (!this.mpcWalletService || !params.ownerId) {
      throw new ServiceUnavailableException(
        'MPC 托管钱包供应商未配置(占位实现需要 MPCWalletService 与 ownerId)',
      );
    }

    // 复用既有 user-scoped MPC 钱包生成(派生口令仅用于本地分片加密,不外泄)。
    const derivedPassword = crypto.randomBytes(16).toString('hex');
    const result = await this.mpcWalletService.generateMPCWalletForUser(
      params.ownerId,
      derivedPassword,
      chain,
    );

    if (!result?.walletAddress) {
      throw new ServiceUnavailableException(
        'MPC 供应商返回空钱包地址,创建失败',
      );
    }

    return {
      walletId: result.walletAddress,
      address: result.walletAddress,
      chain,
      provider: this.name,
    };
  }
}

/**
 * 外部(非托管)钱包绑定 DTO。
 */
export interface BindExternalWalletDto {
  /** 待绑定的外部钱包地址。 */
  walletAddress: string;
  /** 用户用该地址私钥签名的原始消息(归属证明)。 */
  message: string;
  /** 对 `message` 的签名。 */
  signature: string;
  /** 链类型(默认 EVM)。 */
  chainType?: AccountChainType;
}

/**
 * Agent 钱包绑定服务（需求 7 D 组）。
 *
 * spec: crypto-native-agent-ops 需求 7.12/7.13/7.14/7.15 · design §C1 D 组 · Property 8。
 *
 * 职责:
 *  - 7.12 启用托管钱包:经 `MpcWalletProvider` 创建 MPC 钱包并写入 `mpcWalletId`。
 *  - 7.13 绑定外部钱包:`ethers.verifyMessage` 校验地址归属后写入 `externalWalletAddress`。
 *  - 7.14 `defaultAccountId` 与资金 `Account` 双向关联且一致。
 *  - 7.15 创建/绑定失败 → 事务回滚,agent 保持「无钱包可用」安全态,不部分写入。
 */
@Injectable()
export class AgentWalletService {
  private readonly logger = new Logger(AgentWalletService.name);

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepository: Repository<AgentAccount>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @Inject(MPC_WALLET_PROVIDER)
    private readonly mpcProvider: MpcWalletProvider,
  ) {}

  private async findAgentOrThrow(agentId: string): Promise<AgentAccount> {
    const agent = await this.agentAccountRepository.findOne({
      where: { id: agentId },
    });
    if (!agent) {
      throw new NotFoundException('Agent 账户不存在');
    }
    return agent;
  }

  /**
   * 校验外部钱包地址归属（签名验证，需求 7.13）。
   *
   * 复用 `wallet.service` 的 ethers `verifyMessage`:从签名恢复地址,
   * 与声明地址逐字符(小写)比对。任何异常(签名格式错误等)视为校验失败。
   */
  verifyAddressOwnership(
    walletAddress: string,
    message: string,
    signature: string,
  ): boolean {
    try {
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === walletAddress.toLowerCase();
    } catch (err: any) {
      this.logger.warn(`外部钱包签名验证失败: ${err?.message ?? err}`);
      return false;
    }
  }

  /**
   * 启用托管钱包（需求 7.12 + 7.15）。
   *
   * 流程:
   *  1. 已有 `mpcWalletId` → 冲突拒绝(不重复创建)。
   *  2. 经 `MpcWalletProvider` 创建钱包(失败直接抛出 → 未写入 agent,保持安全态)。
   *  3. 事务内写回 `mpcWalletId`,并同步默认托管账户的 `mpcWalletId`(7.14 一致性)。
   *  4. 写回失败 → 事务回滚,agent 保持「无 mpcWalletId」安全态(7.15,不部分写入)。
   */
  async enableManagedWallet(
    agentId: string,
    opts: { chain?: string } = {},
  ): Promise<AgentAccount> {
    const agent = await this.findAgentOrThrow(agentId);

    if (agent.status !== AgentAccountStatus.ACTIVE) {
      throw new BadRequestException('只有活跃的 Agent 可以启用托管钱包');
    }
    if (agent.mpcWalletId) {
      throw new ConflictException('该 Agent 已启用托管钱包');
    }

    // Step 1: 供应商创建钱包(在事务外;失败时 agent 未被改动 → 安全态,7.15)。
    const created = await this.mpcProvider.createWallet({
      agentId: agent.id,
      ownerId: agent.ownerId,
      chain: opts.chain,
    });

    // Step 2: 事务内写回,任一步失败整体回滚(7.15,不部分写入)。
    await this.agentAccountRepository.manager.transaction(async (manager) => {
      const agentRepo = manager.getRepository(AgentAccount);
      const fresh = await agentRepo.findOne({ where: { id: agentId } });
      if (!fresh) {
        throw new NotFoundException('Agent 账户不存在');
      }
      // 并发兜底:事务内复查,若已被其它请求写入则中止(回滚,不覆盖)。
      if (fresh.mpcWalletId) {
        throw new ConflictException('该 Agent 已启用托管钱包');
      }
      fresh.mpcWalletId = created.walletId;
      fresh.registrationChain = fresh.registrationChain || created.chain;
      await agentRepo.save(fresh);

      // 同步默认托管账户的 mpcWalletId,保持账户视图一致(7.14)。
      if (fresh.defaultAccountId) {
        const accountRepo = manager.getRepository(Account);
        const acc = await accountRepo.findOne({
          where: { id: fresh.defaultAccountId },
        });
        if (acc && acc.ownerId === agentId) {
          acc.mpcWalletId = created.walletId;
          if (acc.walletType === AccountWalletType.VIRTUAL) {
            acc.walletType = AccountWalletType.CUSTODIAL;
          }
          await accountRepo.save(acc);
        }
      }
    });

    this.logger.log(
      `Agent ${agent.agentUniqueId} 托管钱包已启用 provider=${created.provider} chain=${created.chain}`,
    );

    return this.findAgentOrThrow(agentId);
  }

  /**
   * 绑定外部钱包（需求 7.13 + 7.15）。
   *
   * 流程:
   *  1. 验签校验地址归属(失败 → 拒绝,任何写入前;7.13)。
   *  2. 事务内:地址查重 → 创建非托管 `Account` → 写回 `externalWalletAddress`。
   *  3. 任一步失败 → 事务回滚,agent 保持「无 externalWalletAddress」安全态(7.15)。
   */
  async bindExternalWallet(
    agentId: string,
    dto: BindExternalWalletDto,
  ): Promise<AgentAccount> {
    const agent = await this.findAgentOrThrow(agentId);

    if (agent.status !== AgentAccountStatus.ACTIVE) {
      throw new BadRequestException('只有活跃的 Agent 可以绑定外部钱包');
    }

    // Step 1: 地址归属校验(签名验证)。失败即拒绝,绝不写入(7.13)。
    const owned = this.verifyAddressOwnership(
      dto.walletAddress,
      dto.message,
      dto.signature,
    );
    if (!owned) {
      throw new BadRequestException('签名验证失败:外部钱包地址归属校验未通过');
    }

    // Step 2: 事务内创建账户 + 写回,任一步失败整体回滚(7.15,不部分写入)。
    await this.agentAccountRepository.manager.transaction(async (manager) => {
      const accountRepo = manager.getRepository(Account);
      const agentRepo = manager.getRepository(AgentAccount);

      // 地址查重:同一地址不可重复绑定。
      const existing = await accountRepo.findOne({
        where: { walletAddress: dto.walletAddress },
      });
      if (existing) {
        throw new ConflictException('该钱包地址已被关联');
      }

      const account = accountRepo.create({
        accountId: this.generateAccountId(),
        name: `外部钱包 ${dto.walletAddress.slice(0, 8)}...`,
        ownerId: agentId,
        ownerType: AccountOwnerType.AGENT,
        walletType: AccountWalletType.NON_CUSTODIAL,
        chainType: dto.chainType || AccountChainType.EVM,
        walletAddress: dto.walletAddress,
        isDefault: false,
        status: AccountStatus.ACTIVE,
      });
      await accountRepo.save(account);

      const fresh = await agentRepo.findOne({ where: { id: agentId } });
      if (!fresh) {
        throw new NotFoundException('Agent 账户不存在');
      }
      fresh.externalWalletAddress = dto.walletAddress;
      await agentRepo.save(fresh);
    });

    this.logger.log(
      `Agent ${agent.agentUniqueId} 外部钱包已绑定: ${dto.walletAddress}`,
    );

    return this.findAgentOrThrow(agentId);
  }

  /**
   * 设置默认资金账户，保证与 agent 双向一致（需求 7.14）。
   *
   * 双向一致语义:
   *  - `agent.defaultAccountId` == 选定 `Account.id`。
   *  - 该 `Account.ownerId` == agentId 且 `ownerType` == AGENT 且 `isDefault` == true。
   *  - 同一 agent 名下其它账户 `isDefault` 置 false(唯一默认)。
   *
   * 全程事务,失败回滚不留半写。
   */
  async setDefaultAccount(
    agentId: string,
    accountId: string,
  ): Promise<AgentAccount> {
    await this.findAgentOrThrow(agentId);

    await this.agentAccountRepository.manager.transaction(async (manager) => {
      const accountRepo = manager.getRepository(Account);
      const agentRepo = manager.getRepository(AgentAccount);

      const target = await accountRepo.findOne({ where: { id: accountId } });
      if (!target) {
        throw new NotFoundException('资金账户不存在');
      }
      if (
        target.ownerId !== agentId ||
        target.ownerType !== AccountOwnerType.AGENT
      ) {
        throw new BadRequestException('该账户不属于此 Agent,不能设为默认账户');
      }

      // 清掉其它默认标记,保证唯一默认账户。
      const owned = await accountRepo.find({
        where: { ownerId: agentId, ownerType: AccountOwnerType.AGENT },
      });
      for (const acc of owned) {
        const shouldBeDefault = acc.id === accountId;
        if (acc.isDefault !== shouldBeDefault) {
          acc.isDefault = shouldBeDefault;
          await accountRepo.save(acc);
        }
      }

      const fresh = await agentRepo.findOne({ where: { id: agentId } });
      if (!fresh) {
        throw new NotFoundException('Agent 账户不存在');
      }
      fresh.defaultAccountId = accountId;
      await agentRepo.save(fresh);
    });

    return this.findAgentOrThrow(agentId);
  }

  /**
   * 校验 `defaultAccountId` 与资金 `Account` 的双向一致性（需求 7.14）。
   *
   * @returns true 仅当 agent.defaultAccountId 指向一个归属本 agent、
   *          类型为 AGENT 且 isDefault=true 的账户。
   */
  async verifyDefaultAccountConsistency(agentId: string): Promise<boolean> {
    const agent = await this.findAgentOrThrow(agentId);
    if (!agent.defaultAccountId) {
      return false;
    }
    const account = await this.accountRepository.findOne({
      where: { id: agent.defaultAccountId },
    });
    if (!account) {
      return false;
    }
    return (
      account.ownerId === agentId &&
      account.ownerType === AccountOwnerType.AGENT &&
      account.isDefault === true
    );
  }

  private generateAccountId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ACC-AGENT-${timestamp}-${random}`;
  }
}
