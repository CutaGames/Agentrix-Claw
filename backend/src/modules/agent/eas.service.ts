import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { ethers } from 'ethers';

/**
 * P3: EAS 自动存证服务
 * 
 * 为 Agent 和 Skill 提供链上身份证明，减少 AI 诈骗风险
 * 支持：
 * 1. Agent 注册存证
 * 2. Skill 发布存证
 * 3. 审计 Root 存证
 * 4. 交易存证
 */

export interface AttestationResult {
  success: boolean;
  uid?: string;
  txHash?: string;
  error?: string;
}

export interface AgentAttestationData {
  agentId: string;
  name: string;
  riskTier: string;
  ownerId: string;
  version?: string;
  capabilities?: string[];
}

export interface SkillAttestationData {
  skillId: string;
  name: string;
  authorId: string;
  version: string;
  category: string;
  pricingType: string;
}

@Injectable()
export class EasService implements OnModuleInit {
  private readonly logger = new Logger(EasService.name);
  private eas: EAS | null = null;
  private signer: ethers.Signer | null = null;
  private isInitialized = false;
  
  // Schema UIDs - 从环境变量读取（需要先注册 Schema）
  private SCHEMAS: {
    AGENT_REGISTRATION: string | undefined;
    SKILL_PUBLICATION: string | undefined;
    AUDIT_ROOT: string | undefined;
    TRANSACTION: string | undefined;
  };

  // 待处理的存证队列（用于批量处理）
  private attestationQueue: Array<{
    type: 'agent' | 'skill' | 'audit' | 'transaction';
    data: any;
    resolve: (result: AttestationResult) => void;
  }> = [];

  constructor(private configService: ConfigService) {
    // 从环境变量读取 Schema UIDs
    this.SCHEMAS = {
      AGENT_REGISTRATION: this.configService.get<string>('EAS_SCHEMA_AGENT_REGISTRATION'),
      SKILL_PUBLICATION: this.configService.get<string>('EAS_SCHEMA_SKILL_PUBLICATION'),
      AUDIT_ROOT: this.configService.get<string>('EAS_SCHEMA_AUDIT_ROOT'),
      TRANSACTION: this.configService.get<string>('EAS_SCHEMA_TRANSACTION'),
    };
  }

  async onModuleInit() {
    const providerUrl = this.configService.get<string>('RPC_URL');
    const privateKey = this.configService.get<string>('EAS_SIGNER_PRIVATE_KEY');
    const easContractAddress = this.configService.get<string>('EAS_CONTRACT_ADDRESS');

    if (!providerUrl || !privateKey || !easContractAddress) {
      this.logger.warn('EAS 配置不完整，将跳过链上存证功能');
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      this.signer = new ethers.Wallet(privateKey, provider);
      this.eas = new EAS(easContractAddress);
      this.eas.connect(this.signer);
      this.logger.log('EAS 服务初始化成功');
    } catch (error) {
      this.logger.error(`EAS 初始化失败: ${error.message}`);
    }
  }

  /**
   * 为 Agent 注册发布链上存证
   */
  async attestAgentRegistration(data: {
    agentId: string;
    name: string;
    riskTier: string;
    ownerId: string;
  }): Promise<string | null> {
    if (!this.eas || !this.SCHEMAS.AGENT_REGISTRATION) {
      this.logger.warn('EAS 未初始化或 AGENT_REGISTRATION Schema 未配置');
      return null;
    }

    try {
      const schemaEncoder = new SchemaEncoder('string agentId, string name, string riskTier, string ownerId');
      const encodedData = schemaEncoder.encodeData([
        { name: 'agentId', value: data.agentId, type: 'string' },
        { name: 'name', value: data.name, type: 'string' },
        { name: 'riskTier', value: data.riskTier, type: 'string' },
        { name: 'ownerId', value: data.ownerId, type: 'string' },
      ]);

      const tx = await this.eas.attest({
        schema: this.SCHEMAS.AGENT_REGISTRATION,
        data: {
          recipient: ethers.ZeroAddress,
          expirationTime: 0n,
          revocable: true,
          data: encodedData,
        },
      });

      const newAttestationUID = await tx.wait();
      this.logger.log(`Agent 存证发布成功: UID=${newAttestationUID}`);
      return newAttestationUID;
    } catch (error) {
      this.logger.error(`发布 Agent 存证失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 为每日审计 Root 发布存证
   */
  async attestAuditRoot(merkleRoot: string, date: string, proofCount?: number): Promise<string | null> {
    if (!this.eas || !this.SCHEMAS.AUDIT_ROOT) {
      this.logger.warn('EAS 未初始化或 AUDIT_ROOT Schema 未配置');
      return null;
    }

    try {
      const schemaEncoder = new SchemaEncoder('bytes32 merkleRoot,string date,uint64 proofCount,string platform');
      const encodedData = schemaEncoder.encodeData([
        { name: 'merkleRoot', value: merkleRoot, type: 'bytes32' },
        { name: 'date', value: date, type: 'string' },
        { name: 'proofCount', value: BigInt(proofCount || 0), type: 'uint64' },
        { name: 'platform', value: 'agentrix', type: 'string' },
      ]);

      const tx = await this.eas.attest({
        schema: this.SCHEMAS.AUDIT_ROOT,
        data: {
          recipient: ethers.ZeroAddress,
          expirationTime: 0n,
          revocable: false,
          data: encodedData,
        },
      });

      const uid = await tx.wait();
      this.logger.log(`审计 Root 存证发布成功: UID=${uid}, date=${date}`);
      return uid;
    } catch (error) {
      this.logger.error(`发布审计 Root 存证失败: ${error.message}`);
      return null;
    }
  }

  /**
   * P3: 为 Skill 发布链上存证
   */
  async attestSkillPublication(data: SkillAttestationData): Promise<AttestationResult> {
    if (!this.eas || !this.isInitialized || !this.SCHEMAS.SKILL_PUBLICATION) {
      return { success: false, error: 'EAS not initialized or SKILL_PUBLICATION Schema not configured' };
    }

    try {
      const schemaEncoder = new SchemaEncoder(
        'string skillId, string name, string authorId, string version, string category, string pricingType'
      );
      const encodedData = schemaEncoder.encodeData([
        { name: 'skillId', value: data.skillId, type: 'string' },
        { name: 'name', value: data.name, type: 'string' },
        { name: 'authorId', value: data.authorId, type: 'string' },
        { name: 'version', value: data.version, type: 'string' },
        { name: 'category', value: data.category, type: 'string' },
        { name: 'pricingType', value: data.pricingType, type: 'string' },
      ]);

      const tx = await this.eas.attest({
        schema: this.SCHEMAS.SKILL_PUBLICATION,
        data: {
          recipient: ethers.ZeroAddress,
          expirationTime: 0n,
          revocable: true,
          data: encodedData,
        },
      });

      const uid = await tx.wait();
      this.logger.log(`Skill 存证发布成功: UID=${uid}`);
      return { success: true, uid };
    } catch (error: any) {
      this.logger.error(`发布 Skill 存证失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * P3: 为交易发布链上存证
   */
  async attestTransaction(data: {
    transactionId: string;
    amount: string;
    currency: string;
    fromUserId: string;
    toMerchantId: string;
    timestamp: string;
  }): Promise<AttestationResult> {
    if (!this.eas || !this.isInitialized) {
      return { success: false, error: 'EAS not initialized' };
    }

    try {
      const schemaEncoder = new SchemaEncoder(
        'string transactionId, string amount, string currency, string fromUserId, string toMerchantId, string timestamp'
      );
      const encodedData = schemaEncoder.encodeData([
        { name: 'transactionId', value: data.transactionId, type: 'string' },
        { name: 'amount', value: data.amount, type: 'string' },
        { name: 'currency', value: data.currency, type: 'string' },
        { name: 'fromUserId', value: data.fromUserId, type: 'string' },
        { name: 'toMerchantId', value: data.toMerchantId, type: 'string' },
        { name: 'timestamp', value: data.timestamp, type: 'string' },
      ]);

      const tx = await this.eas.attest({
        schema: this.SCHEMAS.TRANSACTION,
        data: {
          recipient: ethers.ZeroAddress,
          expirationTime: 0n,
          revocable: false,
          data: encodedData,
        },
      });

      const uid = await tx.wait();
      this.logger.log(`交易存证发布成功: UID=${uid}`);
      return { success: true, uid };
    } catch (error: any) {
      this.logger.error(`发布交易存证失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查 EAS 服务是否可用
   */
  isAvailable(): boolean {
    return this.isInitialized && this.eas !== null;
  }

  /**
   * 获取存证详情（通过 UID）
   */
  async getAttestation(uid: string): Promise<any | null> {
    if (!this.eas) return null;

    try {
      const attestation = await this.eas.getAttestation(uid);
      return attestation;
    } catch (error: any) {
      this.logger.error(`获取存证失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 撤销存证
   */
  async revokeAttestation(uid: string, schema: string): Promise<AttestationResult> {
    if (!this.eas || !this.isInitialized) {
      return { success: false, error: 'EAS not initialized' };
    }

    try {
      const tx = await this.eas.revoke({
        schema,
        data: { uid },
      });
      await tx.wait();
      this.logger.log(`存证已撤销: UID=${uid}`);
      return { success: true, uid };
    } catch (error: any) {
      this.logger.error(`撤销存证失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量存证（异步队列处理）
   */
  async queueAttestation(
    type: 'agent' | 'skill' | 'audit' | 'transaction',
    data: any,
  ): Promise<AttestationResult> {
    return new Promise((resolve) => {
      this.attestationQueue.push({ type, data, resolve });
      
      // 如果队列达到阈值，立即处理
      if (this.attestationQueue.length >= 10) {
        this.processQueue();
      }
    });
  }

  /**
   * 处理存证队列
   */
  private async processQueue(): Promise<void> {
    if (this.attestationQueue.length === 0) return;

    const batch = this.attestationQueue.splice(0, 10);
    
    for (const item of batch) {
      let result: AttestationResult;
      
      switch (item.type) {
        case 'agent':
          result = await this.attestAgentRegistrationV2(item.data);
          break;
        case 'skill':
          result = await this.attestSkillPublication(item.data);
          break;
        case 'transaction':
          result = await this.attestTransaction(item.data);
          break;
        default:
          result = { success: false, error: 'Unknown attestation type' };
      }
      
      item.resolve(result);
    }
  }

  /**
   * Agent 注册存证 V2（返回结构化结果）
   */
  private async attestAgentRegistrationV2(data: AgentAttestationData): Promise<AttestationResult> {
    const uid = await this.attestAgentRegistration({
      agentId: data.agentId,
      name: data.name,
      riskTier: data.riskTier,
      ownerId: data.ownerId,
    });
    
    if (uid) {
      return { success: true, uid };
    }
    return { success: false, error: 'Attestation failed' };
  }
}
