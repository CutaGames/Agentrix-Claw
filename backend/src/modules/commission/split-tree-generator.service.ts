import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

/**
 * 协作协议类型
 */
export enum CollaborationType {
  HIRE = 'hire',           // A 雇佣 B
  DELEGATE = 'delegate',   // A 委托 B
  PARTNER = 'partner',     // A 与 B 合作
  REFERRAL = 'referral',   // A 推荐 B
  SUBCONTRACT = 'subcontract', // A 分包给 B
}

/**
 * Agent 协作协议
 */
export interface AgentCollaborationAgreement {
  id: string;
  primaryAgent: string;    // 主 Agent（发起方）
  secondaryAgent: string;  // 次 Agent（执行方）
  type: CollaborationType;
  terms: {
    revenueShare: number;  // 次 Agent 分成比例 (0-1)
    fixedFee?: number;     // 固定费用
    minAmount?: number;    // 最低分成金额
    maxAmount?: number;    // 最高分成金额
  };
  validFrom: Date;
  validTo?: Date;
  status: 'active' | 'expired' | 'terminated';
  metadata?: Record<string, any>;
}

/**
 * 链上 SplitConfig 结构
 * 对应合约中的 SplitConfig
 */
export interface SplitConfig {
  merchantMPCWallet: string;
  merchantAmount: bigint;
  referralWallet: string;
  referralFee: bigint;
  executionWallet: string;
  executionFee: bigint;
  platformWallet: string;
  platformFee: bigint;
  channelWallet: string;
  channelFee: bigint;
}

/**
 * 分账树节点
 */
export interface SplitTreeNode {
  address: string;
  role: 'merchant' | 'agent' | 'platform' | 'referrer' | 'executor' | 'channel';
  amount: bigint;
  percentage: number;
  children?: SplitTreeNode[];
  source?: string; // 资金来源说明
}

/**
 * 分账树生成结果
 */
export interface SplitTreeResult {
  root: SplitTreeNode;
  flatConfig: SplitConfig;
  totalAmount: bigint;
  timestamp: number;
  hash: string; // 分账树哈希（用于验证）
}

/**
 * Layer B 分账树预计算服务
 * 
 * 根据 Agent 间的协作协议，自动计算出链上的 SplitConfig 结构
 * 无需 Agent 手动传参
 */
@Injectable()
export class SplitTreeGeneratorService {
  private readonly logger = new Logger(SplitTreeGeneratorService.name);

  constructor(private readonly configService: ConfigService) {}

  // 平台钉子地址（从环境变量读取）
  private get platformWallet(): string {
    return this.configService.get<string>('PLATFORM_WALLET_ADDRESS') || '0x0000000000000000000000000000000000000000';
  }
  private get channelWallet(): string {
    return this.configService.get<string>('CHANNEL_WALLET_ADDRESS') || '0x0000000000000000000000000000000000000001';
  }

  // 费率配置
  private readonly RATES = {
    physical: { platform: 0.005, channel: 0.003, incentivePool: 0.022 },
    service: { platform: 0.010, channel: 0.003, incentivePool: 0.037 },
    virtual: { platform: 0.005, channel: 0.003, incentivePool: 0.022 },
    nft: { platform: 0.005, channel: 0.003, incentivePool: 0.017 },
  };

  // 协作协议存储（实际应使用数据库）
  private agreementStore: Map<string, AgentCollaborationAgreement[]> = new Map();

  /**
   * 根据协作意图生成分账树
   * 
   * @param amount 总金额（wei）
   * @param merchantWallet 商户钱包
   * @param collaborationIntent 协作意图
   * @param productType 产品类型
   * @param isX402 是否使用 X402 协议
   */
  async generateSplitTree(
    amount: bigint,
    merchantWallet: string,
    collaborationIntent: {
      requestingAgent?: string;
      executingAgent?: string;
      referrerAgent?: string;
      taskId?: string;
    },
    productType: 'physical' | 'service' | 'virtual' | 'nft' = 'service',
    isX402: boolean = false,
  ): Promise<SplitTreeResult> {
    const rates = this.RATES[productType];
    const timestamp = Date.now();

    // 1. 计算基础费用
    const platformFee = this.calculateShare(amount, rates.platform);
    const channelFee = isX402 ? this.calculateShare(amount, rates.channel) : 0n;
    const incentivePool = this.calculateShare(amount, rates.incentivePool);

    // 2. 查找协作协议
    const agreements = await this.findApplicableAgreements(
      collaborationIntent.requestingAgent,
      collaborationIntent.executingAgent,
      collaborationIntent.referrerAgent,
    );

    // 3. 计算 Agent 分成
    const { referralFee, executionFee, referralWallet, executionWallet } = 
      await this.calculateAgentShares(incentivePool, agreements, collaborationIntent);

    // 4. 计算商户净收入
    const merchantAmount = amount - platformFee - channelFee - incentivePool;

    // 5. 构建分账树
    const root: SplitTreeNode = {
      address: 'payment',
      role: 'merchant',
      amount,
      percentage: 100,
      children: [
        {
          address: merchantWallet,
          role: 'merchant',
          amount: merchantAmount,
          percentage: Number(merchantAmount * 10000n / amount) / 100,
          source: '商户净收入',
        },
        {
          address: this.platformWallet,
          role: 'platform',
          amount: platformFee,
          percentage: Number(platformFee * 10000n / amount) / 100,
          source: '平台服务费',
        },
      ],
    };

    // 添加渠道费用（如果是 X402）
    if (isX402 && channelFee > 0n) {
      root.children!.push({
        address: this.channelWallet,
        role: 'channel',
        amount: channelFee,
        percentage: Number(channelFee * 10000n / amount) / 100,
        source: 'X402 渠道费',
      });
    }

    // 添加推荐人分成
    if (referralWallet && referralFee > 0n) {
      root.children!.push({
        address: referralWallet,
        role: 'referrer',
        amount: referralFee,
        percentage: Number(referralFee * 10000n / amount) / 100,
        source: '推荐人奖励',
      });
    }

    // 添加执行者分成
    if (executionWallet && executionFee > 0n) {
      root.children!.push({
        address: executionWallet,
        role: 'executor',
        amount: executionFee,
        percentage: Number(executionFee * 10000n / amount) / 100,
        source: '执行 Agent 报酬',
      });
    }

    // 6. 生成扁平化配置（用于合约调用）
    const flatConfig: SplitConfig = {
      merchantMPCWallet: merchantWallet,
      merchantAmount,
      referralWallet: referralWallet || '0x0000000000000000000000000000000000000000',
      referralFee,
      executionWallet: executionWallet || '0x0000000000000000000000000000000000000000',
      executionFee,
      platformWallet: this.platformWallet,
      platformFee,
      channelWallet: this.channelWallet,
      channelFee,
    };

    // 7. 计算分账树哈希
    const hash = this.hashSplitConfig(flatConfig);

    return {
      root,
      flatConfig,
      totalAmount: amount,
      timestamp,
      hash,
    };
  }

  /**
   * 注册协作协议
   */
  async registerAgreement(agreement: AgentCollaborationAgreement): Promise<void> {
    const key = `${agreement.primaryAgent}:${agreement.secondaryAgent}`;
    const existing = this.agreementStore.get(key) || [];
    existing.push(agreement);
    this.agreementStore.set(key, existing);
    
    this.logger.log(`Registered collaboration agreement: ${key} (${agreement.type})`);
  }

  /**
   * 查找适用的协作协议
   */
  async findApplicableAgreements(
    requestingAgent?: string,
    executingAgent?: string,
    referrerAgent?: string,
  ): Promise<AgentCollaborationAgreement[]> {
    const agreements: AgentCollaborationAgreement[] = [];
    const now = new Date();

    // 查找请求方和执行方之间的协议
    if (requestingAgent && executingAgent) {
      const key = `${requestingAgent}:${executingAgent}`;
      const found = this.agreementStore.get(key) || [];
      agreements.push(...found.filter(a => 
        a.status === 'active' &&
        a.validFrom <= now &&
        (!a.validTo || a.validTo >= now)
      ));
    }

    // 查找推荐人相关协议
    if (referrerAgent) {
      // 查找所有与推荐人相关的协议
      for (const [key, agmts] of this.agreementStore.entries()) {
        if (key.includes(referrerAgent)) {
          agreements.push(...agmts.filter(a =>
            a.status === 'active' &&
            a.type === CollaborationType.REFERRAL &&
            a.validFrom <= now &&
            (!a.validTo || a.validTo >= now)
          ));
        }
      }
    }

    return agreements;
  }

  /**
   * 根据协议计算 Agent 分成
   */
  private async calculateAgentShares(
    incentivePool: bigint,
    agreements: AgentCollaborationAgreement[],
    intent: {
      requestingAgent?: string;
      executingAgent?: string;
      referrerAgent?: string;
    },
  ): Promise<{
    referralFee: bigint;
    executionFee: bigint;
    referralWallet: string | null;
    executionWallet: string | null;
  }> {
    let referralFee = 0n;
    let executionFee = 0n;
    let referralWallet: string | null = null;
    let executionWallet: string | null = null;

    // 默认分配：执行者 70%，推荐人 30%
    const defaultExecutorShare = 0.7;
    const defaultReferrerShare = 0.3;

    // 如果有推荐人
    if (intent.referrerAgent) {
      referralWallet = intent.referrerAgent;
      
      // 查找推荐人协议
      const referralAgreement = agreements.find(a => 
        a.type === CollaborationType.REFERRAL &&
        (a.primaryAgent === intent.referrerAgent || a.secondaryAgent === intent.referrerAgent)
      );

      if (referralAgreement) {
        referralFee = this.calculateShare(incentivePool, referralAgreement.terms.revenueShare);
      } else {
        referralFee = this.calculateShare(incentivePool, defaultReferrerShare);
      }
    }

    // 如果有执行者
    if (intent.executingAgent) {
      executionWallet = intent.executingAgent;

      // 查找执行协议
      const executionAgreement = agreements.find(a =>
        (a.type === CollaborationType.HIRE || a.type === CollaborationType.DELEGATE) &&
        a.secondaryAgent === intent.executingAgent
      );

      if (executionAgreement) {
        // 根据协议计算执行者分成
        if (executionAgreement.terms.fixedFee) {
          executionFee = BigInt(Math.floor(executionAgreement.terms.fixedFee * 1e6));
        } else {
          executionFee = this.calculateShare(incentivePool, executionAgreement.terms.revenueShare);
        }

        // 应用最小/最大限制
        if (executionAgreement.terms.minAmount) {
          const minFee = BigInt(Math.floor(executionAgreement.terms.minAmount * 1e6));
          if (executionFee < minFee) executionFee = minFee;
        }
        if (executionAgreement.terms.maxAmount) {
          const maxFee = BigInt(Math.floor(executionAgreement.terms.maxAmount * 1e6));
          if (executionFee > maxFee) executionFee = maxFee;
        }
      } else {
        executionFee = this.calculateShare(incentivePool, defaultExecutorShare);
      }
    }

    // 确保总分成不超过激励池
    const totalAgentFees = referralFee + executionFee;
    if (totalAgentFees > incentivePool) {
      // 按比例缩减
      const ratio = Number(incentivePool) / Number(totalAgentFees);
      referralFee = BigInt(Math.floor(Number(referralFee) * ratio));
      executionFee = BigInt(Math.floor(Number(executionFee) * ratio));
    }

    return { referralFee, executionFee, referralWallet, executionWallet };
  }

  /**
   * 验证分账配置的合法性
   */
  validateSplitConfig(config: SplitConfig, totalAmount: bigint): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 验证地址格式
    const addressFields = ['merchantMPCWallet', 'referralWallet', 'executionWallet', 'platformWallet', 'channelWallet'];
    for (const field of addressFields) {
      const address = config[field as keyof SplitConfig];
      if (typeof address === 'string' && address !== '0x0000000000000000000000000000000000000000') {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
          errors.push(`Invalid address format for ${field}`);
        }
      }
    }

    // 验证金额总和
    const totalFees = config.merchantAmount + 
                     config.referralFee + 
                     config.executionFee + 
                     config.platformFee + 
                     config.channelFee;

    if (totalFees !== totalAmount) {
      errors.push(`Sum of fees (${totalFees}) does not match total amount (${totalAmount})`);
    }

    // 验证商户分成不为负
    if (config.merchantAmount < 0n) {
      errors.push('Merchant amount cannot be negative');
    }

    // 验证平台费用在合理范围
    const platformPercentage = Number(config.platformFee * 10000n / totalAmount) / 100;
    if (platformPercentage > 5) {
      errors.push(`Platform fee too high: ${platformPercentage}%`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 计算比例分成
   */
  private calculateShare(amount: bigint, rate: number): bigint {
    const bps = BigInt(Math.round(rate * 10000));
    return amount * bps / 10000n;
  }

  /**
   * 生成分账配置哈希
   */
  private hashSplitConfig(config: SplitConfig): string {
    const data = JSON.stringify({
      m: config.merchantMPCWallet,
      ma: config.merchantAmount.toString(),
      r: config.referralWallet,
      rf: config.referralFee.toString(),
      e: config.executionWallet,
      ef: config.executionFee.toString(),
      p: config.platformWallet,
      pf: config.platformFee.toString(),
      c: config.channelWallet,
      cf: config.channelFee.toString(),
    });

    // 简单哈希
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'split_' + Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
 * 将 SplitConfig 编码为合约调用参数
 */
  encodeSplitConfigForContract(config: SplitConfig): string {
    // 使用 ethers.js ABI 编码
    const { ethers } = require('ethers');
    
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(
      ['address', 'uint256', 'address', 'uint256', 'address', 'uint256', 'address', 'uint256', 'address', 'uint256'],
      [
        config.merchantMPCWallet,
        config.merchantAmount,
        config.referralWallet,
        config.referralFee,
        config.executionWallet,
        config.executionFee,
        config.platformWallet,
        config.platformFee,
        config.channelWallet,
        config.channelFee,
      ]
    );
  }

  // ============ 多跳分账（Multi-hop Recursive Splits）============

  /**
   * 多跳分账节点
   */
  private multiHopNodes: Map<string, MultiHopSplitNode[]> = new Map();

  /**
   * 注册多跳分账链
   * 支持无限层级的虚拟分账，最终合并为一次链上 SplitConfig 提交
   * 
   * @example
   * Agent A -> Agent B -> Agent C -> Agent D
   * A 付款 100 USDC, B 分 20%, C 分 15%, D 分 10%
   * 最终链上只提交一次分账配置
   */
  async registerMultiHopSplit(
    rootAgentId: string,
    splitChain: MultiHopSplitNode[],
  ): Promise<void> {
    this.multiHopNodes.set(rootAgentId, splitChain);
    this.logger.log(`Registered multi-hop split chain for ${rootAgentId}: ${splitChain.length} nodes`);
  }

  /**
   * 生成多跳分账树
   * 支持无限层级，但在链上合并为单次 SplitConfig
   */
  async generateMultiHopSplitTree(
    amount: bigint,
    merchantWallet: string,
    rootAgentId: string,
    productType: 'physical' | 'service' | 'virtual' | 'nft' = 'service',
  ): Promise<MultiHopSplitResult> {
    const rates = this.RATES[productType];
    const timestamp = Date.now();

    // 1. 计算基础费用
    const platformFee = this.calculateShare(amount, rates.platform);
    const channelFee = this.calculateShare(amount, rates.channel);
    
    // 2. 计算可分配给 Agent 的金额
    const agentPool = amount - platformFee - channelFee;
    
    // 3. 获取分账链
    const splitChain = this.multiHopNodes.get(rootAgentId) || [];
    
    // 4. 递归计算每个节点的分成
    const flattenedSplits: FlattenedSplit[] = [];
    await this.flattenMultiHopChain(
      agentPool,
      merchantWallet,
      splitChain,
      flattenedSplits,
      0, // depth
    );

    // 5. 合并相同地址的分成
    const mergedSplits = this.mergeSplitsByAddress(flattenedSplits);

    // 6. 构建分账树（用于可视化）
    const treeRoot = this.buildMultiHopTree(amount, merchantWallet, splitChain);

    // 7. 生成扁平化配置（用于合约调用）
    const flatConfig = this.multiHopToFlatConfig(
      merchantWallet,
      mergedSplits,
      platformFee,
      channelFee,
    );

    // 8. 生成 Gas 优化的批量调用数据
    const batchCallData = this.generateBatchCallData(mergedSplits);

    return {
      root: treeRoot,
      flattenedSplits: mergedSplits,
      flatConfig,
      batchCallData,
      totalAmount: amount,
      totalRecipients: mergedSplits.length,
      estimatedGasSaving: this.estimateGasSaving(splitChain.length, mergedSplits.length),
      timestamp,
    };
  }

  /**
   * 递归展平分账链
   */
  private async flattenMultiHopChain(
    remainingAmount: bigint,
    parentAddress: string,
    nodes: MultiHopSplitNode[],
    result: FlattenedSplit[],
    depth: number,
    maxDepth: number = 100, // 防止无限递归
  ): Promise<void> {
    if (depth >= maxDepth) {
      this.logger.warn(`Max depth reached in multi-hop split chain`);
      return;
    }

    for (const node of nodes) {
      // 计算当前节点的分成
      const nodeShare = this.calculateShare(remainingAmount, node.sharePercent / 100);
      
      result.push({
        address: node.agentAddress,
        amount: nodeShare,
        role: node.role,
        depth,
        parentAddress,
        sourceAgentId: node.agentId,
      });

      // 递归处理子节点
      if (node.children && node.children.length > 0) {
        const childPool = nodeShare; // 子节点从父节点的分成中分
        await this.flattenMultiHopChain(
          childPool,
          node.agentAddress,
          node.children,
          result,
          depth + 1,
          maxDepth,
        );
      }
    }
  }

  /**
   * 合并相同地址的分成
   */
  private mergeSplitsByAddress(splits: FlattenedSplit[]): FlattenedSplit[] {
    const merged = new Map<string, FlattenedSplit>();

    for (const split of splits) {
      const existing = merged.get(split.address);
      if (existing) {
        existing.amount += split.amount;
        existing.role = `${existing.role}, ${split.role}`;
      } else {
        merged.set(split.address, { ...split });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * 构建多跳分账树（用于可视化）
   */
  private buildMultiHopTree(
    amount: bigint,
    merchantWallet: string,
    chain: MultiHopSplitNode[],
  ): SplitTreeNode {
    const root: SplitTreeNode = {
      address: 'payment',
      role: 'merchant',
      amount,
      percentage: 100,
      children: [],
    };

    // 递归构建子节点
    const buildChildren = (nodes: MultiHopSplitNode[], parentAmount: bigint): SplitTreeNode[] => {
      return nodes.map(node => {
        const nodeAmount = this.calculateShare(parentAmount, node.sharePercent / 100);
        const child: SplitTreeNode = {
          address: node.agentAddress,
          role: node.role,
          amount: nodeAmount,
          percentage: node.sharePercent,
          source: `来自 ${node.agentId}`,
        };

        if (node.children && node.children.length > 0) {
          child.children = buildChildren(node.children, nodeAmount);
        }

        return child;
      });
    };

    root.children = buildChildren(chain, amount);
    return root;
  }

  /**
   * 将多跳分账转换为扁平 SplitConfig
   */
  private multiHopToFlatConfig(
    merchantWallet: string,
    mergedSplits: FlattenedSplit[],
    platformFee: bigint,
    channelFee: bigint,
  ): SplitConfig {
    // 找出最大的两个分成作为 referral 和 execution
    const sorted = [...mergedSplits].sort((a, b) => 
      Number(b.amount) - Number(a.amount)
    );

    const primary = sorted[0];
    const secondary = sorted[1];

    // 计算商户金额（剩余金额）
    const totalAgentSplit = mergedSplits.reduce((sum, s) => sum + s.amount, 0n);

    return {
      merchantMPCWallet: merchantWallet,
      merchantAmount: 0n, // 商户已在 mergedSplits 中
      referralWallet: secondary?.address || '0x0000000000000000000000000000000000000000',
      referralFee: secondary?.amount || 0n,
      executionWallet: primary?.address || '0x0000000000000000000000000000000000000000',
      executionFee: primary?.amount || 0n,
      platformWallet: this.platformWallet,
      platformFee,
      channelWallet: this.channelWallet,
      channelFee,
    };
  }

  /**
   * 生成批量调用数据（Gas 优化）
   */
  private generateBatchCallData(splits: FlattenedSplit[]): string {
    // 为超过 4 层的分账生成批量转账调用数据
    const { ethers } = require('ethers');
    
    const addresses = splits.map(s => s.address);
    const amounts = splits.map(s => s.amount);

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(
      ['address[]', 'uint256[]'],
      [addresses, amounts],
    );
  }

  /**
   * 估算 Gas 节省
   */
  private estimateGasSaving(originalLayers: number, mergedCount: number): number {
    // 假设每次链上分账消耗 ~50,000 gas
    const gasPerSplit = 50000;
    const originalGas = originalLayers * gasPerSplit;
    const optimizedGas = mergedCount * gasPerSplit;
    
    return Math.max(0, originalGas - optimizedGas);
  }
}

// ============ 多跳分账类型定义 ============

/**
 * 多跳分账节点
 */
export interface MultiHopSplitNode {
  agentId: string;        // Agent ID
  agentAddress: string;   // Agent 钱包地址
  sharePercent: number;   // 分成比例 (0-100)
  role: 'merchant' | 'agent' | 'platform' | 'referrer' | 'executor' | 'channel';  // 角色
  children?: MultiHopSplitNode[]; // 子节点（分包给谁）
}

/**
 * 展平后的分账记录
 */
export interface FlattenedSplit {
  address: string;
  amount: bigint;
  role: string;
  depth: number;
  parentAddress: string;
  sourceAgentId: string;
}

/**
 * 多跳分账结果
 */
export interface MultiHopSplitResult {
  root: SplitTreeNode;
  flattenedSplits: FlattenedSplit[];
  flatConfig: SplitConfig;
  batchCallData: string;
  totalAmount: bigint;
  totalRecipients: number;
  estimatedGasSaving: number;
  timestamp: number;
}
