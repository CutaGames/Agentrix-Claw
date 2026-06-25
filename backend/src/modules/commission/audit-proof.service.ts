import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as crypto from 'crypto';

/**
 * Proof 状态
 */
export enum ProofStatus {
  PENDING = 'pending',           // 等待提交
  SUBMITTED = 'submitted',       // 已提交
  VERIFYING = 'verifying',       // 验证中
  VERIFIED = 'verified',         // 已验证
  REJECTED = 'rejected',         // 已拒绝
  RELEASED = 'released',         // 已释放资金
}

/**
 * 验证模式
 */
export enum VerificationMode {
  HASH_MATCH = 'hash_match',     // 哈希匹配
  SIGNATURE = 'signature',       // 签名验证
  ZKP = 'zkp',                   // 零知识证明
  AUTO = 'auto',                 // 自动验证
}

/**
 * Audit Proof 记录
 */
export interface AuditProofRecord {
  id: string;
  orderId: string;
  taskId: string;
  
  // 任务信息
  taskDescription: string;
  expectedResultHash: string;
  submittedResultHash?: string;
  
  // 参与方
  creator: string;       // 付款方
  executor: string;      // 执行方
  auditor?: string;      // 审计员
  
  // 金额
  amount: number;
  currency: string;
  
  // 验证
  mode: VerificationMode;
  status: ProofStatus;
  qualityScore?: number;
  
  // 元数据
  metadata?: Record<string, any>;
  
  // 时间戳
  createdAt: Date;
  submittedAt?: Date;
  verifiedAt?: Date;
  releasedAt?: Date;
}

/**
 * ZKP 验证结果
 */
export interface ZKPVerificationResult {
  valid: boolean;
  similarity: number;  // 0-100
  proof?: string;      // ZKP 证明
  message?: string;
}

/**
 * Audit Proof Service
 * 
 * 实现"任务完成度"的自动结算机制：
 * 1. 哈希匹配：比较预期结果与实际结果的哈希
 * 2. 内容相似度：计算图片/文本的相似度
 * 3. ZKP 验证：零知识证明验证
 */
@Injectable()
export class AuditProofService {
  private readonly logger = new Logger(AuditProofService.name);
  
  // 内存存储（生产环境应使用数据库）
  private proofs: Map<string, AuditProofRecord> = new Map();
  
  // 合约实例
  private commissionContract: ethers.Contract | null = null;
  private auditProofContract: ethers.Contract | null = null;
  
  // 最低质量分
  private readonly MIN_QUALITY_SCORE = 60;
  
  // 自动验证阈值
  private readonly AUTO_VERIFY_SIMILARITY = 95;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.initContracts();
  }

  /**
   * 初始化合约
   */
  private async initContracts() {
    try {
      const rpcUrl = this.configService.get('BSC_TESTNET_RPC_URL');
      const privateKey = this.configService.get('RELAYER_PRIVATE_KEY');
      const commissionAddress = this.configService.get('COMMISSION_CONTRACT_ADDRESS');
      const auditProofAddress = this.configService.get('AUDIT_PROOF_CONTRACT_ADDRESS');

      if (rpcUrl && privateKey && commissionAddress) {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // Commission 合约 ABI (简化) - V5.0 更新
        const commissionAbi = [
          'function submitProof(bytes32 orderId, bytes32 resultHash) external',
          'function verifyProof(bytes32 orderId, bool approved, uint256 quality) external',
          'function getProofStatus(bytes32 orderId) external view returns (bool, bytes32, bytes32, bool, address)',
          'function distributeCommission(bytes32 orderId) external',
          // V5.0 新增函数
          'function x402ChannelFeeRate() external view returns (uint16)',
          'function setX402ChannelFeeRate(uint16 newRate) external',
          'function scannedFeeRates(uint8 source) external view returns (uint16)',
          'function layerPlatformFees(uint8 layer) external view returns (uint16)',
          'function layerPoolRates(uint8 layer) external view returns (uint16)',
          'function calculateV5Split(uint256 amount, uint8 layer, bool hasReferrer, bool hasExecutor, bool executorHasWallet) external view returns (uint256, uint256, uint256, uint256, uint256)',
          'function autoPaySplit(bytes32 orderId, uint256 amount, address payer) external',
          'function scannedProductSplit(bytes32 orderId, uint256 originalAmount, uint8 source, address referrer) external',
        ];
        
        this.commissionContract = new ethers.Contract(commissionAddress, commissionAbi, wallet);
        this.logger.log('Commission contract initialized');
        
        if (auditProofAddress) {
          // AuditProof 合约 ABI
          const auditProofAbi = [
            'function createTask(bytes32 taskId, address executor, address token, uint256 amount, uint8 mode, bytes32 expectedProofHash, address[] auditors, uint256 requiredSignatures, uint256 deadline) external returns (bytes32)',
            'function fundTask(bytes32 taskId) external payable',
            'function submitResult(bytes32 taskId, bytes32 resultHash) external',
            'function verifyResult(bytes32 taskId, bytes32 resultHash, uint256 quality, bytes signature) external',
            'function confirmRelease(bytes32 taskId, uint256 quality) external',
            'function getTask(bytes32 taskId) external view returns (tuple(bytes32,address,address,address,uint256,uint256,uint8,bytes32,address[],uint256,uint8,uint256,uint256,uint256,bytes32,uint256))',
          ];
          
          this.auditProofContract = new ethers.Contract(auditProofAddress, auditProofAbi, wallet);
          this.logger.log('AuditProof contract initialized');
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to init contracts: ${error}`);
    }
  }

  /**
   * 创建 Audit Proof 任务
   */
  async createProof(params: {
    orderId: string;
    taskId: string;
    taskDescription: string;
    expectedResultHash: string;
    creator: string;
    executor: string;
    auditor?: string;
    amount: number;
    currency: string;
    mode?: VerificationMode;
    metadata?: Record<string, any>;
  }): Promise<AuditProofRecord> {
    const id = this.generateId();
    
    const proof: AuditProofRecord = {
      id,
      orderId: params.orderId,
      taskId: params.taskId,
      taskDescription: params.taskDescription,
      expectedResultHash: params.expectedResultHash,
      creator: params.creator,
      executor: params.executor,
      auditor: params.auditor,
      amount: params.amount,
      currency: params.currency,
      mode: params.mode || VerificationMode.AUTO,
      status: ProofStatus.PENDING,
      metadata: params.metadata,
      createdAt: new Date(),
    };

    this.proofs.set(id, proof);
    this.proofs.set(params.orderId, proof); // 也用 orderId 索引
    
    this.logger.log(`Created audit proof: ${id} for order ${params.orderId}`);
    
    // 如果有合约，同步到链上
    if (this.commissionContract) {
      try {
        const orderIdBytes = ethers.id(params.orderId);
        // 在链上设置 proof 要求（通过后端 relayer 调用）
        // 注：实际调用需要 relayer 权限
      } catch (error) {
        this.logger.warn(`Failed to sync proof to chain: ${error}`);
      }
    }

    return proof;
  }

  /**
   * 提交任务结果
   */
  async submitResult(
    orderId: string,
    resultHash: string,
    resultData?: Buffer | string,
  ): Promise<AuditProofRecord> {
    const proof = this.proofs.get(orderId);
    if (!proof) {
      throw new BadRequestException('Proof not found');
    }

    if (proof.status !== ProofStatus.PENDING) {
      throw new BadRequestException(`Invalid status: ${proof.status}`);
    }

    proof.submittedResultHash = resultHash;
    proof.status = ProofStatus.SUBMITTED;
    proof.submittedAt = new Date();

    // 自动验证
    if (proof.mode === VerificationMode.AUTO || proof.mode === VerificationMode.HASH_MATCH) {
      const verifyResult = await this.autoVerify(proof, resultData);
      
      if (verifyResult.valid && verifyResult.similarity >= this.AUTO_VERIFY_SIMILARITY) {
        proof.status = ProofStatus.VERIFIED;
        proof.qualityScore = verifyResult.similarity;
        proof.verifiedAt = new Date();
        
        this.logger.log(`Auto-verified proof ${proof.id} with score ${verifyResult.similarity}`);
        
        // 自动触发资金释放
        await this.releaseIfVerified(proof);
      }
    }

    // 同步到链上
    if (this.commissionContract) {
      try {
        const orderIdBytes = ethers.id(orderId);
        const resultHashBytes = ethers.id(resultHash);
        
        const tx = await this.commissionContract.submitProof(orderIdBytes, resultHashBytes);
        await tx.wait();
        
        this.logger.log(`Submitted proof to chain: ${tx.hash}`);
      } catch (error) {
        this.logger.warn(`Failed to submit proof to chain: ${error}`);
      }
    }

    return proof;
  }

  /**
   * 自动验证
   */
  private async autoVerify(
    proof: AuditProofRecord,
    resultData?: Buffer | string,
  ): Promise<ZKPVerificationResult> {
    // 1. 精确哈希匹配
    if (proof.submittedResultHash === proof.expectedResultHash) {
      return { valid: true, similarity: 100 };
    }

    // 2. 如果有原始数据，计算相似度
    if (resultData) {
      const similarity = await this.calculateSimilarity(
        proof.expectedResultHash,
        proof.submittedResultHash!,
        resultData,
      );
      
      return {
        valid: similarity >= this.MIN_QUALITY_SCORE,
        similarity,
      };
    }

    // 3. 默认返回不匹配
    return { valid: false, similarity: 0, message: 'Hash mismatch' };
  }

  /**
   * 计算相似度（简化实现）
   * 
   * 实际生产环境应使用：
   * - 图片：pHash, dHash, 或 CNN 特征向量
   * - 文本：余弦相似度, BERT embedding
   * - 代码：AST 比较
   */
  private async calculateSimilarity(
    expectedHash: string,
    submittedHash: string,
    data: Buffer | string,
  ): Promise<number> {
    // 简化实现：如果哈希完全匹配返回 100，否则基于哈希计算伪相似度
    if (expectedHash === submittedHash) {
      return 100;
    }

    // 计算哈希的汉明距离（用于感知哈希）
    const hammingDistance = this.hammingDistance(expectedHash, submittedHash);
    const maxDistance = Math.max(expectedHash.length, submittedHash.length) * 4; // 每字符 4 位
    
    const similarity = Math.max(0, 100 - (hammingDistance / maxDistance) * 100);
    return Math.round(similarity);
  }

  /**
   * 计算汉明距离
   */
  private hammingDistance(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    let distance = 0;
    
    for (let i = 0; i < maxLen; i++) {
      if (a[i] !== b[i]) distance++;
    }
    
    return distance;
  }

  /**
   * 审计员验证
   */
  async verifyByAuditor(
    orderId: string,
    auditorAddress: string,
    approved: boolean,
    qualityScore: number,
    signature?: string,
  ): Promise<AuditProofRecord> {
    const proof = this.proofs.get(orderId);
    if (!proof) {
      throw new BadRequestException('Proof not found');
    }

    if (proof.status !== ProofStatus.SUBMITTED) {
      throw new BadRequestException(`Invalid status: ${proof.status}`);
    }

    // 验证审计员权限
    if (proof.auditor && proof.auditor !== auditorAddress) {
      throw new BadRequestException('Not authorized auditor');
    }

    if (approved && qualityScore >= this.MIN_QUALITY_SCORE) {
      proof.status = ProofStatus.VERIFIED;
      proof.qualityScore = qualityScore;
      proof.verifiedAt = new Date();
      
      // 触发资金释放
      await this.releaseIfVerified(proof);
    } else {
      proof.status = ProofStatus.REJECTED;
      proof.qualityScore = qualityScore;
    }

    // 同步到链上
    if (this.commissionContract) {
      try {
        const orderIdBytes = ethers.id(orderId);
        const tx = await this.commissionContract.verifyProof(
          orderIdBytes,
          approved,
          qualityScore,
        );
        await tx.wait();
        
        this.logger.log(`Verified proof on chain: ${tx.hash}`);
      } catch (error) {
        this.logger.warn(`Failed to verify proof on chain: ${error}`);
      }
    }

    return proof;
  }

  /**
   * 如果已验证，释放资金
   */
  private async releaseIfVerified(proof: AuditProofRecord): Promise<void> {
    if (proof.status !== ProofStatus.VERIFIED) {
      return;
    }

    // 调用合约释放资金
    if (this.commissionContract) {
      try {
        const orderIdBytes = ethers.id(proof.orderId);
        const tx = await this.commissionContract.distributeCommission(orderIdBytes);
        await tx.wait();
        
        proof.status = ProofStatus.RELEASED;
        proof.releasedAt = new Date();
        
        this.logger.log(`Released funds for proof ${proof.id}: ${tx.hash}`);
      } catch (error) {
        this.logger.warn(`Failed to release funds: ${error}`);
      }
    } else {
      // 模拟释放
      proof.status = ProofStatus.RELEASED;
      proof.releasedAt = new Date();
      this.logger.log(`Simulated release for proof ${proof.id}`);
    }
  }

  /**
   * 生成结果哈希
   * 用于执行者提交结果时生成哈希
   */
  generateResultHash(data: Buffer | string): string {
    if (typeof data === 'string') {
      data = Buffer.from(data);
    }
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 获取 Proof 状态
   */
  getProof(orderId: string): AuditProofRecord | undefined {
    return this.proofs.get(orderId);
  }

  /**
   * 获取用户的所有 Proof
   */
  getProofsByUser(userAddress: string): AuditProofRecord[] {
    return Array.from(this.proofs.values()).filter(
      p => p.creator === userAddress || p.executor === userAddress,
    );
  }

  /**
   * 生成 ID
   */
  private generateId(): string {
    return `proof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============ ZKP 相关（预留接口）============

  /**
   * 生成 ZKP 证明（预留）
   * 
   * 在实际生产中，可以使用：
   * - snarkjs + circom 生成 zk-SNARK 证明
   * - 或 plonk / groth16 等证明系统
   */
  async generateZKProof(
    taskId: string,
    resultData: Buffer,
    expectedHash: string,
  ): Promise<{ proof: string; publicInputs: string[] }> {
    // TODO: 集成真正的 ZKP 系统
    // 目前返回模拟数据
    return {
      proof: `zk_proof_${taskId}_${Date.now()}`,
      publicInputs: [expectedHash, this.generateResultHash(resultData)],
    };
  }

  /**
   * 验证 ZKP 证明（预留）
   */
  async verifyZKProof(
    proof: string,
    publicInputs: string[],
  ): Promise<boolean> {
    // TODO: 集成真正的 ZKP 验证
    // 目前返回模拟结果
    return proof.startsWith('zk_proof_');
  }
}
