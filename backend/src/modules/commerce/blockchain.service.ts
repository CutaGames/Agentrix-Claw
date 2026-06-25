import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * BlockchainService - 封装所有链上合约调用
 * 
 * 支持的合约:
 * - BudgetPool: 预算池管理（创建、充值、里程碑、释放、提取）
 * - CommissionV2: 分佣（executeSplit、claimAll）
 * 
 * 使用 Relayer 钱包签名交易，用户不需要直接操作链上
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  
  private provider: ethers.JsonRpcProvider;
  private relayerWallet: ethers.Wallet;
  
  private budgetPoolContract: ethers.Contract;
  private commissionV2Contract: ethers.Contract;
  private usdcContract: ethers.Contract;
  
  private readonly BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
  private readonly RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
  private readonly BUDGET_POOL_ADDRESS = process.env.BUDGET_POOL_ADDRESS;
  private readonly COMMISSION_V2_ADDRESS = process.env.COMMISSION_V2_ADDRESS;
  private readonly USDC_ADDRESS = process.env.BSC_TESTNET_USDC_ADDRESS || process.env.SETTLEMENT_TOKEN_ADDRESS;
  
  // BudgetPool ABI (关键函数)
  private readonly BUDGET_POOL_ABI = [
    'function createPool(string _name, string _description, uint256 _totalBudget, uint256 _deadline, tuple(uint256 minQualityScore, bool requiresApproval, uint256 autoReleaseDelay) _qualityGate) external',
    'function fundPool(uint256 _poolId, uint256 _amount) external',
    'function activatePool(uint256 _poolId) external',
    'function addApprover(uint256 _poolId, address _approver) external',
    'function removeApprover(uint256 _poolId, address _approver) external',
    'function createMilestone(uint256 _poolId, string _title, string _description, uint256 _percentOfBudget, address[] _participants, uint256[] _shares) external',
    'function startMilestone(uint256 _milestoneId) external',
    'function submitMilestone(uint256 _milestoneId, bytes32 _deliverableHash) external',
    'function approveMilestone(uint256 _milestoneId, uint256 _qualityScore) external',
    'function rejectMilestone(uint256 _milestoneId) external',
    'function releaseMilestoneFunds(uint256 _milestoneId) external',
    'function claim() external',
    'function getPool(uint256 _poolId) external view returns (tuple(address owner, string name, string description, uint256 totalBudget, uint256 fundedAmount, uint256 releasedAmount, uint8 status, uint256 deadline, uint256 milestoneCount, uint256 createdAt))',
    'function getMilestone(uint256 _milestoneId) external view returns (tuple(uint256 poolId, string title, string description, uint256 amount, uint8 status, bytes32 deliverableHash, uint256 qualityScore, uint256 createdAt, uint256 completedAt))',
    'function getPendingBalance(address _participant) external view returns (uint256)',
    'function poolCount() external view returns (uint256)',
    'event PoolCreated(uint256 indexed poolId, address indexed owner, string name, uint256 totalBudget)',
    'event MilestoneCreated(uint256 indexed milestoneId, uint256 indexed poolId, string title, uint256 amount)',
    'event MilestoneFundsReleased(uint256 indexed milestoneId, uint256 amount)',
  ];
  
  // CommissionV2 ABI (关键函数)
  private readonly COMMISSION_V2_ABI = [
    'function executeSplit(bytes32 _orderId, address _payer, uint256 _amount, tuple(address recipient, uint256 bps)[] _rules) external',
    'function claimAll() external',
    'function pendingBalances(address) external view returns (uint256)',
    'function platformTreasury() external view returns (address)',
    'function settlementToken() external view returns (address)',
    'function owner() external view returns (address)',
  ];
  
  // ERC20 ABI
  private readonly ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function decimals() external view returns (uint8)',
  ];

  async onModuleInit() {
    if (!this.RELAYER_PRIVATE_KEY) {
      this.logger.warn('RELAYER_PRIVATE_KEY not set - blockchain operations disabled');
      return;
    }
    
    try {
      this.provider = new ethers.JsonRpcProvider(this.BSC_TESTNET_RPC);
      this.relayerWallet = new ethers.Wallet(this.RELAYER_PRIVATE_KEY, this.provider);
      
      if (this.BUDGET_POOL_ADDRESS) {
        this.budgetPoolContract = new ethers.Contract(
          this.BUDGET_POOL_ADDRESS,
          this.BUDGET_POOL_ABI,
          this.relayerWallet,
        );
        this.logger.log(`BudgetPool contract: ${this.BUDGET_POOL_ADDRESS}`);
      }
      
      if (this.COMMISSION_V2_ADDRESS) {
        this.commissionV2Contract = new ethers.Contract(
          this.COMMISSION_V2_ADDRESS,
          this.COMMISSION_V2_ABI,
          this.relayerWallet,
        );
        this.logger.log(`CommissionV2 contract: ${this.COMMISSION_V2_ADDRESS}`);
      }
      
      if (this.USDC_ADDRESS) {
        this.usdcContract = new ethers.Contract(
          this.USDC_ADDRESS,
          this.ERC20_ABI,
          this.relayerWallet,
        );
        this.logger.log(`USDC contract: ${this.USDC_ADDRESS}`);
      }
      
      const balance = await this.provider.getBalance(this.relayerWallet.address);
      this.logger.log(`Relayer: ${this.relayerWallet.address} | Balance: ${ethers.formatEther(balance)} tBNB`);
    } catch (error) {
      this.logger.error('Failed to initialize blockchain service:', error.message);
    }
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return !!this.provider && !!this.relayerWallet;
  }

  // ==================== BudgetPool 操作 ====================

  /**
   * 在链上创建预算池
   */
  async createPoolOnChain(params: {
    name: string;
    description: string;
    totalBudget: bigint; // 以 USDC 最小单位（6位小数）
    deadline: number; // Unix timestamp
    minQualityScore?: number;
    requiresApproval?: boolean;
    autoReleaseDelay?: number;
  }): Promise<{ txHash: string; poolId: number }> {
    this.ensureContract('budgetPool');
    
    const qualityGate = {
      minQualityScore: params.minQualityScore || 0,
      requiresApproval: params.requiresApproval !== false,
      autoReleaseDelay: params.autoReleaseDelay || 0,
    };
    
    this.logger.log(`Creating pool on-chain: ${params.name}, budget: ${params.totalBudget}`);
    
    const tx = await this.budgetPoolContract.createPool(
      params.name,
      params.description,
      params.totalBudget,
      params.deadline,
      qualityGate,
    );
    
    const receipt = await tx.wait();
    
    // 从事件中提取 poolId
    const poolCreatedEvent = receipt.logs.find(
      (log: any) => {
        try {
          const parsed = this.budgetPoolContract.interface.parseLog(log);
          return parsed?.name === 'PoolCreated';
        } catch { return false; }
      }
    );
    
    let poolId = 0;
    if (poolCreatedEvent) {
      const parsed = this.budgetPoolContract.interface.parseLog(poolCreatedEvent);
      poolId = Number(parsed.args.poolId);
    }
    
    this.logger.log(`Pool created on-chain: poolId=${poolId}, tx=${receipt.hash}`);
    return { txHash: receipt.hash, poolId };
  }

  /**
   * 充值到预算池（需要先 approve USDC）
   */
  async fundPoolOnChain(poolId: number, amount: bigint): Promise<string> {
    this.ensureContract('budgetPool');
    this.ensureContract('usdc');
    
    // 先检查 allowance
    const allowance = await this.usdcContract.allowance(
      this.relayerWallet.address,
      this.BUDGET_POOL_ADDRESS,
    );
    
    if (allowance < amount) {
      this.logger.log(`Approving USDC: ${amount}`);
      const approveTx = await this.usdcContract.approve(this.BUDGET_POOL_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();
    }
    
    this.logger.log(`Funding pool ${poolId}: ${amount}`);
    const tx = await this.budgetPoolContract.fundPool(poolId, amount);
    const receipt = await tx.wait();
    
    this.logger.log(`Pool funded: tx=${receipt.hash}`);
    return receipt.hash;
  }

  /**
   * 创建里程碑
   */
  async createMilestoneOnChain(params: {
    poolId: number;
    title: string;
    description: string;
    percentOfBudget: number;
    participants: string[];
    shares: number[];
  }): Promise<{ txHash: string; milestoneId: number }> {
    this.ensureContract('budgetPool');
    
    const tx = await this.budgetPoolContract.createMilestone(
      params.poolId,
      params.title,
      params.description,
      params.percentOfBudget,
      params.participants,
      params.shares,
    );
    
    const receipt = await tx.wait();
    
    const milestoneEvent = receipt.logs.find(
      (log: any) => {
        try {
          const parsed = this.budgetPoolContract.interface.parseLog(log);
          return parsed?.name === 'MilestoneCreated';
        } catch { return false; }
      }
    );
    
    let milestoneId = 0;
    if (milestoneEvent) {
      const parsed = this.budgetPoolContract.interface.parseLog(milestoneEvent);
      milestoneId = Number(parsed.args.milestoneId);
    }
    
    this.logger.log(`Milestone created: id=${milestoneId}, tx=${receipt.hash}`);
    return { txHash: receipt.hash, milestoneId };
  }

  /**
   * 释放里程碑资金
   */
  async releaseMilestoneFundsOnChain(milestoneId: number): Promise<string> {
    this.ensureContract('budgetPool');
    
    this.logger.log(`Releasing milestone funds: ${milestoneId}`);
    const tx = await this.budgetPoolContract.releaseMilestoneFunds(milestoneId);
    const receipt = await tx.wait();
    
    this.logger.log(`Milestone funds released: tx=${receipt.hash}`);
    return receipt.hash;
  }

  /**
   * 参与者提取收益
   */
  async claimBudgetPoolEarnings(): Promise<string> {
    this.ensureContract('budgetPool');
    
    const tx = await this.budgetPoolContract.claim();
    const receipt = await tx.wait();
    
    this.logger.log(`Earnings claimed: tx=${receipt.hash}`);
    return receipt.hash;
  }

  /**
   * 查询参与者待提取余额
   */
  async getPendingBalance(participant: string): Promise<bigint> {
    this.ensureContract('budgetPool');
    return await this.budgetPoolContract.getPendingBalance(participant);
  }

  /**
   * 查询链上池信息
   */
  async getPoolOnChain(poolId: number): Promise<any> {
    this.ensureContract('budgetPool');
    return await this.budgetPoolContract.getPool(poolId);
  }

  // ==================== CommissionV2 操作 ====================

  /**
   * 执行分佣
   */
  async executeSplit(params: {
    orderId: string;
    payer: string;
    amount: bigint;
    rules: { recipient: string; bps: number }[];
  }): Promise<string> {
    this.ensureContract('commissionV2');
    
    const orderIdBytes = ethers.encodeBytes32String(params.orderId.substring(0, 31));
    
    const tx = await this.commissionV2Contract.executeSplit(
      orderIdBytes,
      params.payer,
      params.amount,
      params.rules,
    );
    
    const receipt = await tx.wait();
    this.logger.log(`Split executed: orderId=${params.orderId}, tx=${receipt.hash}`);
    return receipt.hash;
  }

  // ==================== 交易验证 ====================

  /**
   * 验证链上交易是否成功
   */
  async verifyTransaction(txHash: string): Promise<{
    success: boolean;
    blockNumber?: number;
    from?: string;
    to?: string;
    gasUsed?: string;
  }> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return { success: false };
      }
      return {
        success: receipt.status === 1,
        blockNumber: receipt.blockNumber,
        from: receipt.from,
        to: receipt.to,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to verify tx ${txHash}:`, error.message);
      return { success: false };
    }
  }

  /**
   * 查询 USDC 余额
   */
  async getUsdcBalance(address: string): Promise<bigint> {
    this.ensureContract('usdc');
    return await this.usdcContract.balanceOf(address);
  }

  /**
   * 获取 Relayer 地址
   */
  getRelayerAddress(): string {
    return this.relayerWallet?.address || '';
  }

  // ==================== 内部方法 ====================

  private ensureContract(name: 'budgetPool' | 'commissionV2' | 'usdc') {
    const contracts = {
      budgetPool: this.budgetPoolContract,
      commissionV2: this.commissionV2Contract,
      usdc: this.usdcContract,
    };
    
    if (!contracts[name]) {
      throw new Error(`${name} contract not initialized. Check .env configuration.`);
    }
  }
}
