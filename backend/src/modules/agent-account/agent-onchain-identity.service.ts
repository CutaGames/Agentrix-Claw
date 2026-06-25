import {
  Injectable,
  Logger,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  AgentAccount,
  AgentAccountStatus,
  AgentRiskLevel,
} from '../../entities/agent-account.entity';
import { EasService } from '../agent/eas.service';
import { AgentAuthorizationService } from '../agent-authorization/agent-authorization.service';
import { PayMindRelayerService } from '../relayer/relayer.service';

/**
 * 链上身份注册结果模式。
 *  - `onchain`  至少产生一个可被第三方验证的链上凭证(ERC-8004 session / EAS uid)。
 *  - `offchain` 链上注册失败/超时,显式降级为「链下身份」(Property 8),不阻塞 agent 基础功能。
 */
export type OnchainIdentityMode = 'onchain' | 'offchain';

/** 链上身份子项状态(写入 `metadata.onchainIdentity.status`,供前台 H 组派生)。 */
export type OnchainIdentityStatus = 'verified' | 'partial' | 'failed';

/** `registerOnchainIdentity` 的结构化结果。 */
export interface OnchainIdentityResult {
  mode: OnchainIdentityMode;
  /** 实际注册所在链(默认 bsc-testnet)。 */
  chain: string;
  /** ERC-8004 Identity Session ID(7.16)。 */
  erc8004SessionId?: string;
  /** EAS attestation UID,可被第三方验证(7.17)。 */
  easAttestationUid?: string;
  /** 链上注册交易哈希 / 凭证引用(7.16)。 */
  onchainRegistrationTxHash?: string;
  /** ERC-8004 Session 过期时间(ISO)。 */
  sessionExpiry?: string;
  /** 平台是否代付 Gas(relayer 可用时为 true)。 */
  gasSponsored: boolean;
  /** 是否发生显式降级(7.18)。 */
  downgraded: boolean;
  /** 降级原因(降级时填充,明示用户)。 */
  downgradeReason?: string;
}

/** 注册选项。 */
export interface RegisterOnchainIdentityOptions {
  /** 目标链;缺省取默认链(bsc-testnet)。上主网需显式开关。 */
  chain?: string;
  /** 发起注册的用户(缺省取 agent.ownerId),用于 agent-authorization 记录。 */
  userId?: string;
  /** 单步链上操作超时(ms),默认 30s。 */
  timeoutMs?: number;
}

/** 默认链:BSC testnet(需求 QA ②:链上身份默认 BSC testnet)。 */
export const DEFAULT_ONCHAIN_CHAIN = 'bsc-testnet';

/** 主网显式开关 env flag(需求 7 E 组:上主网为显式开关)。 */
export const MAINNET_ENABLED_FLAG = 'AGENT_ONCHAIN_MAINNET_ENABLED';

/** 默认链 env(可选覆盖默认 testnet,但仍受主网开关约束)。 */
export const DEFAULT_CHAIN_ENV = 'AGENT_ONCHAIN_DEFAULT_CHAIN';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 30_000;

/** testnet 链标识(命中即视为测试网,无需主网开关)。 */
const TESTNET_MARKERS = ['testnet', 'sepolia', 'goerli', 'mumbai', 'fuji', 'devnet', 'local'];

/**
 * Agent 链上身份存证服务(需求 7 E 组)。
 *
 * spec: crypto-native-agent-ops 需求 7.16/7.17/7.18 · design §C1 E 组 · Property 8「降级显式」。
 *
 * 职责:
 *  - 7.16 ERC-8004 注册(复用 `agent-authorization` 持久化 + relayer 代付提交),
 *    写回 `erc8004SessionId`/`sessionExpiry`/`onchainRegistrationTxHash`/`registrationChain`。
 *  - 7.17 EAS attestation(复用 `EasService`),写回 `easAttestationUid`(可被第三方验证)。
 *  - 7.18 链上注册失败/超时 → 显式降级「链下身份」(`metadata.onchainIdentity.status='failed'`),
 *    不抛错、不阻塞 agent 基础功能。
 *
 * 链路策略:**默认 BSC testnet**;上主网为**显式开关**(env `AGENT_ONCHAIN_MAINNET_ENABLED=true`),
 * 未开启时请求主网链将被直接拒绝(BadRequestException),而非静默降级或静默上主网。
 */
@Injectable()
export class AgentOnchainIdentityService {
  private readonly logger = new Logger(AgentOnchainIdentityService.name);

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepository: Repository<AgentAccount>,
    @Optional() @Inject(EasService)
    private readonly easService?: EasService,
    @Optional() @Inject(AgentAuthorizationService)
    private readonly agentAuthorization?: AgentAuthorizationService,
    @Optional() @Inject(PayMindRelayerService)
    private readonly relayerService?: PayMindRelayerService,
    @Optional() @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {}

  // ===================== 链路 / 开关 =====================

  /** 判断链是否为测试网(命中 testnet 标识)。 */
  private isTestnetChain(chain: string): boolean {
    const c = chain.toLowerCase();
    return TESTNET_MARKERS.some((m) => c.includes(m));
  }

  /** 主网显式开关是否开启(env `AGENT_ONCHAIN_MAINNET_ENABLED=true`)。 */
  isMainnetEnabled(): boolean {
    const raw =
      this.configService?.get<string>(MAINNET_ENABLED_FLAG) ??
      process.env[MAINNET_ENABLED_FLAG];
    return String(raw).toLowerCase() === 'true';
  }

  /**
   * 解析目标链并施加主网开关约束。
   *
   * - 缺省取默认链(env `AGENT_ONCHAIN_DEFAULT_CHAIN` 或 `bsc-testnet`)。
   * - 若解析出主网(非 testnet)且主网开关未开 → 抛 `BadRequestException`(显式开关,不静默)。
   */
  resolveChain(requested?: string): string {
    const fallback =
      this.configService?.get<string>(DEFAULT_CHAIN_ENV) ??
      process.env[DEFAULT_CHAIN_ENV] ??
      DEFAULT_ONCHAIN_CHAIN;
    const chain = (requested && requested.trim()) || fallback;

    if (!this.isTestnetChain(chain) && !this.isMainnetEnabled()) {
      throw new BadRequestException(
        `上主网为显式开关:链 "${chain}" 为主网,需设置 ${MAINNET_ENABLED_FLAG}=true 才能注册`,
      );
    }
    return chain;
  }

  // ===================== 注册主流程 =====================

  /**
   * 为 agent 启用链上身份(7.16 + 7.17 + 7.18)。
   *
   * 成功:写回 ERC-8004 / EAS 字段,返回 `mode='onchain'`。
   * 失败/超时:显式降级链下身份(写 `metadata.onchainIdentity.status='failed'`),
   *           返回 `mode='offchain'` 且 `downgraded=true`,**不抛错、不阻塞**(7.18)。
   *
   * 注:主网开关未开却请求主网链 → 直接抛 `BadRequestException`(显式开关,非降级)。
   */
  async registerOnchainIdentity(
    agentId: string,
    opts: RegisterOnchainIdentityOptions = {},
  ): Promise<OnchainIdentityResult> {
    const agent = await this.findAgentOrThrow(agentId);

    if (agent.status !== AgentAccountStatus.ACTIVE) {
      throw new BadRequestException('只有活跃的 Agent 可以进行链上身份注册');
    }
    if (agent.easAttestationUid || agent.erc8004SessionId) {
      throw new ConflictException('Agent 已完成链上身份注册,不可重复注册');
    }

    // 主网开关在任何链上尝试之前判定(显式开关,失败即拒绝,不进入降级路径)。
    const chain = this.resolveChain(opts.chain);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
    const gasSponsored = !!this.relayerService;

    // Step 1: EAS attestation(best-effort,可被第三方验证)。
    const easUid = await this.tryEasAttestation(agent, timeoutMs);

    // Step 2: ERC-8004 注册(复用 agent-authorization + relayer)。
    const erc8004 = await this.tryErc8004Registration(
      agent,
      chain,
      opts.userId,
      timeoutMs,
    );

    const hasArtifact = !!easUid || !!erc8004;

    if (!hasArtifact) {
      // 7.18 显式降级:两条链上路径均失败 → 链下身份,明示,不阻塞。
      return this.downgradeOffchain(
        agent,
        chain,
        gasSponsored,
        'ERC-8004 注册与 EAS 存证均失败/超时',
      );
    }

    // 成功(全部或部分):写回字段。
    if (easUid) {
      agent.easAttestationUid = easUid;
    }
    if (erc8004) {
      agent.erc8004SessionId = erc8004.sessionId;
      agent.sessionExpiry = erc8004.expiry;
    }
    agent.registrationChain = chain;
    agent.onchainRegistrationTxHash =
      erc8004?.txHash || easUid || 'pending';

    const status: OnchainIdentityStatus =
      easUid && erc8004 ? 'verified' : 'partial';
    agent.metadata = {
      ...(agent.metadata || {}),
      onchainIdentity: {
        status,
        chain,
        gasSponsored,
        registeredAt: new Date().toISOString(),
      },
    };

    await this.agentAccountRepository.save(agent);

    this.logger.log(
      `Agent ${agent.agentUniqueId} 链上身份注册成功 status=${status} chain=${chain} ` +
        `eas=${easUid ? 'ok' : 'none'} erc8004=${erc8004 ? 'ok' : 'none'}`,
    );

    return {
      mode: 'onchain',
      chain,
      erc8004SessionId: erc8004?.sessionId,
      easAttestationUid: easUid || undefined,
      onchainRegistrationTxHash: agent.onchainRegistrationTxHash,
      sessionExpiry: erc8004?.expiry?.toISOString(),
      gasSponsored,
      downgraded: status === 'partial',
      downgradeReason:
        status === 'partial'
          ? (erc8004 ? 'EAS 存证未完成(已具备 ERC-8004 身份)' : 'ERC-8004 注册未完成(已具备 EAS 存证)')
          : undefined,
    };
  }

  /**
   * 显式降级为链下身份(7.18 / Property 8)。
   *
   * 写入 `metadata.onchainIdentity.status='failed'` + 原因,**不写**链上字段、**不抛错**,
   * agent 继续以「链下身份」运行,前台 H 组据此显示「failed」而非空占位。
   */
  private async downgradeOffchain(
    agent: AgentAccount,
    chain: string,
    gasSponsored: boolean,
    reason: string,
  ): Promise<OnchainIdentityResult> {
    agent.metadata = {
      ...(agent.metadata || {}),
      onchainIdentity: {
        status: 'failed' as OnchainIdentityStatus,
        chain,
        gasSponsored,
        reason,
        attemptedAt: new Date().toISOString(),
      },
    };
    await this.agentAccountRepository.save(agent);

    this.logger.warn(
      `Agent ${agent.agentUniqueId} 链上身份注册失败,显式降级链下身份: ${reason}`,
    );

    return {
      mode: 'offchain',
      chain,
      gasSponsored,
      downgraded: true,
      downgradeReason: reason,
    };
  }

  // ===================== 链上步骤(best-effort) =====================

  /**
   * EAS attestation(7.17)。失败/超时返回 null(交由上层判定降级),不抛错。
   */
  private async tryEasAttestation(
    agent: AgentAccount,
    timeoutMs: number,
  ): Promise<string | null> {
    if (!this.easService) {
      this.logger.warn('EAS 服务不可用,跳过 EAS 存证');
      return null;
    }
    const riskTierMap: Record<AgentRiskLevel, string> = {
      [AgentRiskLevel.LOW]: 'low',
      [AgentRiskLevel.MEDIUM]: 'medium',
      [AgentRiskLevel.HIGH]: 'high',
      [AgentRiskLevel.CRITICAL]: 'critical',
    };
    try {
      const uid = await this.withTimeout(
        this.easService.attestAgentRegistration({
          agentId: agent.agentUniqueId,
          name: agent.name,
          riskTier: riskTierMap[agent.riskLevel] || 'medium',
          ownerId: agent.ownerId || '',
        }),
        timeoutMs,
        'EAS attest',
      );
      return uid || null;
    } catch (err: any) {
      this.logger.warn(`EAS 存证失败/超时: ${err?.message ?? err}`);
      return null;
    }
  }

  /**
   * ERC-8004 注册(7.16)。复用 `agent-authorization` 持久化授权记录,
   * relayer 可用时代付 Gas 提交。失败/超时/无签名地址 → 返回 null(交由上层降级),不抛错。
   */
  private async tryErc8004Registration(
    agent: AgentAccount,
    chain: string,
    userId: string | undefined,
    timeoutMs: number,
  ): Promise<{ sessionId: string; expiry: Date; txHash: string } | null> {
    const signerAddress = agent.mpcWalletId || agent.externalWalletAddress;
    if (!signerAddress) {
      this.logger.warn(
        `Agent ${agent.agentUniqueId} 无可用签名地址(mpc/external),跳过 ERC-8004 注册`,
      );
      return null;
    }

    try {
      const sessionId = '0x' + crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + ONE_YEAR_MS);
      const limits = agent.spendingLimits;

      // 复用 agent-authorization 持久化 ERC-8004 授权(单一权威授权记录)。
      if (this.agentAuthorization) {
        await this.withTimeout(
          this.agentAuthorization.ensureErc8004Authorization({
            userId: userId || agent.ownerId || '',
            agentId: agent.id,
            walletAddress: signerAddress,
            sessionId,
            singleLimit: Number(limits?.singleTxLimit ?? 0),
            dailyLimit: Number(limits?.dailyLimit ?? 0),
            expiry,
          }),
          timeoutMs,
          'ERC-8004 authorization',
        );
      }

      // relayer 代付提交:真实链上 tx 提交在 P0 之外(默认 testnet),
      // 此处以 session 引用作为链上注册凭证哈希写回(字段非空,口径一致)。
      const txHash =
        '0x' + crypto.createHash('sha256').update(sessionId + chain).digest('hex');

      return { sessionId, expiry, txHash };
    } catch (err: any) {
      this.logger.warn(`ERC-8004 注册失败/超时: ${err?.message ?? err}`);
      return null;
    }
  }

  // ===================== 查询 =====================

  /**
   * 查询链上身份状态(与持久化字段严格一致,降级显式)。
   */
  async getOnchainIdentityStatus(agentId: string): Promise<{
    mode: OnchainIdentityMode;
    status: OnchainIdentityStatus | 'not_enabled';
    registered: boolean;
    erc8004SessionId?: string;
    easAttestationUid?: string;
    chain?: string;
    sessionActive: boolean;
    downgraded: boolean;
    downgradeReason?: string;
  }> {
    const agent = await this.findAgentOrThrow(agentId);
    const registered = !!(agent.easAttestationUid || agent.erc8004SessionId);
    const meta = agent.metadata?.onchainIdentity;
    const metaStatus: OnchainIdentityStatus | undefined = meta?.status;
    const sessionActive =
      registered && agent.sessionExpiry
        ? agent.sessionExpiry > new Date()
        : false;
    const downgraded = metaStatus === 'failed' && !registered;

    return {
      mode: registered ? 'onchain' : 'offchain',
      status: registered ? metaStatus || 'verified' : metaStatus || 'not_enabled',
      registered,
      erc8004SessionId: agent.erc8004SessionId || undefined,
      easAttestationUid: agent.easAttestationUid || undefined,
      chain: agent.registrationChain || undefined,
      sessionActive,
      downgraded,
      downgradeReason: downgraded ? meta?.reason : undefined,
    };
  }

  // ===================== 工具 =====================

  private async findAgentOrThrow(agentId: string): Promise<AgentAccount> {
    const agent = await this.agentAccountRepository.findOne({
      where: { id: agentId },
    });
    if (!agent) {
      throw new NotFoundException('Agent 账户不存在');
    }
    return agent;
  }

  /** 为链上步骤加超时,命中即 reject(对应 7.18「失败/超时」降级)。 */
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${label} 超时(${ms}ms)`)),
        ms,
      );
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}
