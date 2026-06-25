import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PaymentService } from '../payment/payment.service';
import { CommissionService } from '../commission/commission.service';
import { PaymentStatus } from '../../entities/payment.entity';

@Injectable()
export class ContractListenerService implements OnModuleInit {
  private readonly logger = new Logger(ContractListenerService.name);
  private provider: ethers.Provider;
  private autoPayContract: ethers.Contract | null = null;
  private commissionContract: ethers.Contract | null = null;

  constructor(
    private configService: ConfigService,
    private paymentService: PaymentService,
    private commissionService: CommissionService,
  ) {
    // 优先使用 BSC_TESTNET_RPC_URL，如果没有则使用 RPC_URL，再没有则使用 ETHEREUM_RPC_URL，最后使用默认值
    const rpcUrl = this.configService.get<string>('BSC_TESTNET_RPC_URL')
      || this.configService.get<string>('RPC_URL')
      || this.configService.get<string>('ETHEREUM_RPC_URL')
      || 'https://eth-mainnet.g.alchemy.com/v2/demo';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async onModuleInit() {
    // 启动合约事件监听
    this.startListening();
  }

  private async startListening() {
    try {
      // TODO: 从配置或数据库获取合约地址
      const autoPayAddress = this.configService.get<string>(
        'AUTO_PAY_CONTRACT_ADDRESS',
      );
      const commissionAddress = this.configService.get<string>(
        'COMMISSION_CONTRACT_ADDRESS',
      );

      if (autoPayAddress) {
        await this.listenAutoPayEvents(autoPayAddress);
      }

      if (commissionAddress) {
        await this.listenCommissionEvents(commissionAddress);
      }
    } catch (error) {
      this.logger.error('启动合约事件监听失败:', error);
    }
  }

  /**
   * 监听AutoPay合约事件
   */
  private async listenAutoPayEvents(contractAddress: string) {
    // AutoPay合约ABI（简化版）
    const abi = [
      'event AutoPaymentExecuted(bytes32 indexed paymentId, address indexed user, address indexed agent, address recipient, uint256 amount)',
    ];

    this.autoPayContract = new ethers.Contract(
      contractAddress,
      abi,
      this.provider,
    );

    // 监听自动支付执行事件
    this.autoPayContract.on(
      'AutoPaymentExecuted',
      async (
        paymentId: string,
        user: string,
        agent: string,
        recipient: string,
        amount: bigint,
        event: any,
      ) => {
        this.logger.log(
          `自动支付执行: paymentId=${paymentId}, amount=${amount.toString()}`,
        );

        try {
          // 更新支付状态
          await this.paymentService.updatePaymentStatus(
            paymentId,
            PaymentStatus.COMPLETED,
            event.transactionHash,
          );
        } catch (error) {
          this.logger.error('更新自动支付状态失败:', error);
        }
      },
    );

    this.logger.log(`开始监听AutoPay合约事件: ${contractAddress}`);
  }

  /**
   * 监听Commission合约事件
   */
  private async listenCommissionEvents(contractAddress: string) {
    const abi = [
      // 原有事件
      'event SettlementCompleted(bytes32 indexed settlementId, address indexed payee, uint256 amount, address currency)',
      // 新增事件（非托管支付流程）
      'event PaymentReceived(bytes32 indexed orderId, uint8 scenario, address indexed from, uint256 amount)',
      'event PaymentAutoSplit(bytes32 indexed orderId, bytes32 indexed sessionId, address indexed merchantWallet, uint256 totalAmount, uint256 merchantAmount, uint256 platformFee, uint256 executionFee, uint256 referralFee)',
      'event SplitConfigSet(bytes32 indexed orderId, tuple(address merchantMPCWallet, uint256 merchantAmount, address referrer, uint256 referralFee, address executor, uint256 executionFee, uint256 platformFee, bool executorHasWallet, uint256 settlementTime, bool isDisputed, bytes32 sessionId) config)',
      'event ProviderAuthorized(address indexed provider, bool authorized)',
    ];

    this.commissionContract = new ethers.Contract(
      contractAddress,
      abi,
      this.provider,
    );

    // 监听结算完成事件（原有）
    this.commissionContract.on(
      'SettlementCompleted',
      async (
        settlementId: string,
        payee: string,
        amount: bigint,
        currency: string,
        event: any,
      ) => {
        this.logger.log(
          `结算完成: settlementId=${settlementId}, amount=${amount.toString()}`,
        );

        try {
          // 标记分润为已结算
          // TODO: 根据payee地址查找用户ID与类型
          // await this.commissionService.markCommissionsAsSettled(userId, PayeeType.AGENT);
        } catch (error) {
          this.logger.error('更新结算状态失败:', error);
        }
      },
    );

    // 监听支付接收事件（新增）
    this.commissionContract.on(
      'PaymentReceived',
      async (
        orderId: string,
        scenario: number,
        from: string,
        amount: bigint,
        event: any,
      ) => {
        const scenarioNames = ['QUICKPAY', 'WALLET', 'PROVIDER_FIAT', 'PROVIDER_CRYPTO'];
        this.logger.log(
          `支付接收: orderId=${orderId}, scenario=${scenarioNames[scenario]}, from=${from}, amount=${ethers.formatUnits(amount, 18)}`,
        );

        try {
          // TODO: 更新支付状态
          // await this.paymentService.updatePaymentStatus(orderId, PaymentStatus.COMPLETED, event.transactionHash);
        } catch (error) {
          this.logger.error('更新支付状态失败:', error);
        }
      },
    );

    // 监听自动分账事件（新增）
    this.commissionContract.on(
      'PaymentAutoSplit',
      async (
        orderId: string,
        sessionId: string,
        merchantWallet: string,
        totalAmount: bigint,
        merchantAmount: bigint,
        platformFee: bigint,
        executionFee: bigint,
        referralFee: bigint,
        event: any,
      ) => {
        this.logger.log(
          `自动分账完成: orderId=${orderId}, merchantAmount=${ethers.formatUnits(merchantAmount, 18)}, platformFee=${ethers.formatUnits(platformFee, 18)}`,
        );

        try {
          // TODO: 更新订单分账状态
          // await this.commissionService.markOrderAsSettled(orderId);
        } catch (error) {
          this.logger.error('更新分账状态失败:', error);
        }
      },
    );

    // 监听分账配置设置事件（新增）
    this.commissionContract.on(
      'SplitConfigSet',
      async (orderId: string, config: any, event: any) => {
        this.logger.log(
          `分账配置已设置: orderId=${orderId}, merchantWallet=${config.merchantMPCWallet}`,
        );
      },
    );

    this.logger.log(`开始监听Commission合约事件: ${contractAddress}`);
  }

  /**
   * 停止监听
   */
  async stopListening() {
    if (this.autoPayContract) {
      this.autoPayContract.removeAllListeners();
    }
    if (this.commissionContract) {
      this.commissionContract.removeAllListeners();
    }
    this.logger.log('已停止合约事件监听');
  }
}

