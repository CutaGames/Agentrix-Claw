import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { AgentAccount } from '../../entities/agent-account.entity';

/**
 * 签发结果。**仅在签发时一次性返回**(需求 7.21)。
 *
 * `privateKey` 与 `apiSecret` 为明文机密:后端不持久化明文(仅存 `apiSecretHash` 与
 * 公钥地址),返回后即不可再读取。调用方有责任安全保管;
 * 这些字段绝不写入日志(Property 10)。
 */
export interface IssuedAgentKeys {
  /** Agent 签名私钥(EVM,0x 开头)。仅签发时一次性返回,后端不存储。 */
  privateKey: string;
  /** 对应公钥(EVM 地址),写入 `publicKey`,用于后续 `ethers.verifyMessage` 验签。 */
  publicKey: string;
  /** API secret 明文(`ak_` 前缀)。仅签发时一次性返回,后端只存 `apiSecretHash`。 */
  apiSecret: string;
  /** API Key 前缀(便于识别),入库且可重复读取(非机密)。 */
  apiKeyPrefix: string;
}

/** 验签结果。失败时给出非敏感原因(不含签名/密钥值)。 */
export interface SignatureVerificationResult {
  valid: boolean;
  /** 失败原因(供审计;绝不包含签名或密钥明文)。 */
  reason?: string;
}

/**
 * Agent 密钥签发与验签服务（需求 7 F 组）。
 *
 * spec: crypto-native-agent-ops 需求 7.19/7.20/7.21 · design §C1 F 组 · Property 10。
 *
 * 职责:
 *  - 7.19 激活时生成密钥对:`publicKey` + `apiKeyPrefix` 入库,`apiSecretHash` 仅存哈希。
 *  - 7.20 agent 代付 / 被外部调用携带签名时,用 `publicKey` 验签(复用
 *    `agent-execute-payment` 已有 `ethers.verifyMessage` 路径),失败即拒绝并审计。
 *  - 7.21 API secret 明文仅在签发时一次性返回,不可再次读取。
 *
 * 安全约束(Property 10):私钥 / API secret 明文绝不写入日志或回包;
 * 审计日志只记录 agentId + 非敏感原因。
 */
@Injectable()
export class AgentKeyService {
  private readonly logger = new Logger(AgentKeyService.name);

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepository: Repository<AgentAccount>,
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
   * 签发密钥对 + API secret（需求 7.19 + 7.21）。
   *
   * 流程:
   *  1. 已签发(存在 `apiSecretHash` / `publicKey`)且未显式轮换 → 冲突拒绝
   *     (保证 secret「不可二次读取」语义,避免静默覆盖)。
   *  2. 生成 EVM 密钥对(私钥 + 公钥地址)与 API secret。
   *  3. 仅持久化 `publicKey` + `apiKeyPrefix` + `apiSecretHash`(明文不落库)。
   *  4. **一次性**返回明文 `privateKey` / `apiSecret`(此后不可再读取)。
   *
   * @param opts.allowRotate 显式轮换:允许覆盖既有密钥(旧 secret 立即失效)。
   */
  async issueKeys(
    agentId: string,
    opts: { allowRotate?: boolean } = {},
  ): Promise<IssuedAgentKeys> {
    const agent = await this.findAgentOrThrow(agentId);

    if ((agent.apiSecretHash || agent.publicKey) && !opts.allowRotate) {
      // secret 明文已在首次签发时一次性返回,无法再次读取;拒绝静默重签。
      throw new ConflictException(
        '该 Agent 已签发密钥;secret 明文不可二次读取,如需轮换请显式轮换',
      );
    }

    // 1. 生成签名密钥对(EVM)。公钥地址用于 ethers.verifyMessage 验签。
    const wallet = ethers.Wallet.createRandom();
    const privateKey = wallet.privateKey;
    const publicKey = wallet.address;

    // 2. 生成 API secret(`ak_` + 32 字节随机十六进制)。
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const apiSecret = `ak_${rawSecret}`;
    const apiKeyPrefix = `ak_${rawSecret.slice(0, 6)}`;
    const apiSecretHash = this.hashSecret(apiSecret);

    // 3. 仅持久化非机密派生值(明文私钥 / secret 绝不入库)。
    agent.publicKey = publicKey;
    agent.apiKeyPrefix = apiKeyPrefix;
    agent.apiSecretHash = apiSecretHash;
    await this.agentAccountRepository.save(agent);

    // 审计仅记录非敏感信息(前缀可公开,绝不含私钥 / secret 明文)。
    this.logger.log(
      `Agent ${agent.agentUniqueId ?? agentId} 密钥已签发 prefix=${apiKeyPrefix} (secret 一次性返回)`,
    );

    // 4. 一次性返回明文机密。
    return { privateKey, publicKey, apiSecret, apiKeyPrefix };
  }

  /**
   * 用 `publicKey` 验签（需求 7.20）。
   *
   * 复用 `agent-execute-payment` 已有 `ethers.verifyMessage` 路径:
   * 从签名恢复地址,与入库 `publicKey` 逐字符(小写)比对。
   * 任何失败(未注册公钥 / 签名不匹配 / 签名格式错误)→ 拒绝并审计
   * (审计只记 agentId + 非敏感原因,绝不记录签名或密钥)。
   */
  async verifySignature(
    agentId: string,
    message: string,
    signature: string,
  ): Promise<SignatureVerificationResult> {
    const agent = await this.findAgentOrThrow(agentId);
    return this.verifyWithPublicKey(agentId, agent.publicKey, message, signature);
  }

  /**
   * 用给定 `publicKey` 验签（无需再查库的内部复用入口）。
   *
   * 与 `agent-execute-payment.verifyAgentSignature` 同构,统一验签路径。
   */
  verifyWithPublicKey(
    agentId: string,
    publicKey: string | undefined,
    message: string,
    signature: string,
  ): SignatureVerificationResult {
    if (!publicKey) {
      this.auditRejection(agentId, '未注册公钥');
      return { valid: false, reason: '未注册公钥' };
    }

    try {
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() === publicKey.toLowerCase()) {
        return { valid: true };
      }
      this.auditRejection(agentId, '签名与公钥不匹配');
      return { valid: false, reason: '签名与公钥不匹配' };
    } catch (err: any) {
      // 注意:只记录错误类别,绝不回显签名内容。
      this.auditRejection(agentId, '签名格式错误');
      return { valid: false, reason: '签名格式错误' };
    }
  }

  /**
   * 校验 API secret 明文是否匹配入库哈希（需求 7.20 携带凭证调用）。
   *
   * `apiSecretHash` 为 `select:false`,此处显式 addSelect 拉取后做常量时间比较。
   * 失败即拒绝并审计;绝不回显 secret 或哈希。
   */
  async verifyApiSecret(agentId: string, apiSecret: string): Promise<boolean> {
    const agent = await this.agentAccountRepository
      .createQueryBuilder('agent')
      .addSelect('agent.apiSecretHash')
      .where('agent.id = :id', { id: agentId })
      .getOne();

    if (!agent) {
      throw new NotFoundException('Agent 账户不存在');
    }
    if (!agent.apiSecretHash) {
      this.auditRejection(agentId, '未签发 API secret');
      return false;
    }

    const candidate = this.hashSecret(apiSecret);
    const ok = this.constantTimeEquals(candidate, agent.apiSecretHash);
    if (!ok) {
      this.auditRejection(agentId, 'API secret 不匹配');
    }
    return ok;
  }

  /** SHA-256 哈希(与既有 `generateApiKey` 口径一致)。 */
  private hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  /** 常量时间比较两个等长十六进制哈希,规避时序侧信道。 */
  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /** 记录验签失败审计(只含 agentId + 非敏感原因,Property 10)。 */
  private auditRejection(agentId: string, reason: string): void {
    this.logger.warn(`Agent ${agentId} 验签拒绝: ${reason}`);
  }
}
