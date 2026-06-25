import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Contract, parseUnits, formatUnits, Network } from 'ethers';
import { User, KYCLevel } from '../../entities/user.entity';
import { WalletConnection } from '../../entities/wallet-connection.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { ProviderManagerService } from './provider-manager.service';
import { OnRampCommissionService } from './on-ramp-commission.service';

export interface ProviderOption {
  id: string; // 'google' | 'apple' | 'card' | 'local'
  name: string;
  price: number; // 需要支付的法币金额（如果订单金额低于最低金额，显示最低金额）
  currency: string; // 法币币种
  requiresKYC: boolean; // 是否需要 KYC
  provider: string; // Provider 名称，如 'transak'
  estimatedTime?: string;
  fee?: number; // 总手续费（Provider 费用 + Agentrix 平台费用，如果为 0 表示未获取到报价）
  providerFee?: number; // Provider 费用（仅 Provider 收取的费用）
  agentrixFee?: number; // Agentrix 平台费用（额外收取的平台费用）
  commissionContractAddress?: string; // 分润佣金合约地址（Provider 兑换后自动打入此地址）
  minAmount?: number; // 最低兑换金额（如果订单金额低于此值，应显示此最低金额）
  available?: boolean; // 是否可用（如果订单金额低于最低金额，则为 false）
}

export interface PreflightResult {
  recommendedRoute: 'quickpay' | 'wallet' | 'crypto-rail' | 'local-rail';
  quickPayAvailable: boolean;
  sessionLimit?: {
    singleLimit: string;
    dailyLimit: string;
    dailyRemaining: string;
  };
  walletBalance?: string;
  walletBalanceIsMock?: boolean; // 标记余额是否为 mock 值
  requiresKYC?: boolean;
  estimatedTime?: string;
  fees?: {
    gasFee?: string;
    providerFee?: string;
    total?: string;
  };
  providerOptions?: ProviderOption[]; // 新增：各支付方式的价格和 KYC 要求
}

// ERC8004SessionManager ABI (简化版)
const ERC8004_ABI = [
  'function sessions(bytes32) view returns (address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive)',
  'function getSession(bytes32) view returns (tuple(address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive))',
  'function getUserSessions(address) view returns (bytes32[])',
];

// USDC ABI (简化版)
const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];

@Injectable()
export class PreflightCheckService {
  private readonly logger = new Logger(PreflightCheckService.name);
  private provider: JsonRpcProvider;
  private sessionManagerContract: Contract | null = null;
  private usdcContract: Contract | null = null;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(WalletConnection)
    private walletRepository: Repository<WalletConnection>,
    private configService: ConfigService,
    private exchangeRateService: ExchangeRateService,
    private providerManagerService?: ProviderManagerService, // 可选注入，用于获取实时 Provider 报价
    private onRampCommissionService?: OnRampCommissionService, // 可选注入，用于计算平台额外费用
  ) {
    this.initializeContracts();
  }

  /**
   * 获取分润佣金合约地址（Provider 兑换后自动打入此地址）
   */
  private getCommissionContractAddress(): string | null {
    return this.configService.get<string>('COMMISSION_CONTRACT_ADDRESS') || null;
  }

  /**
   * 初始化合约连接
   */
  private initializeContracts() {
    try {
      // 默认使用 BSC Testnet (chainId: 97)
      const rpcUrl = this.configService.get<string>('RPC_URL') 
        || this.configService.get<string>('BSC_TESTNET_RPC_URL') 
        || process.env.RPC_URL 
        || process.env.BSC_TESTNET_RPC_URL
        || 'https://bsc-testnet.nodereal.io/v1/1eefed273dc64160afd5e328e6c518d6';
      
      // 确保 chainId 是数字类型，默认 BSC Testnet (97)
      const chainIdStr = this.configService.get<string>('CHAIN_ID') || process.env.CHAIN_ID || '97';
      const chainId = typeof chainIdStr === 'string' ? parseInt(chainIdStr, 10) : (chainIdStr as number);
      
      // 创建自定义 Network 对象（ethers v6 要求）
      const network = new Network(
        `chain-${chainId}`, // name
        chainId,            // chainId (必须是数字)
      );
      
      this.provider = new JsonRpcProvider(rpcUrl, network);

      const contractAddress = this.configService.get<string>('ERC8004_CONTRACT_ADDRESS');
      if (contractAddress) {
        this.sessionManagerContract = new Contract(
          contractAddress,
          ERC8004_ABI,
          this.provider,
        );
      }

      const usdcAddress = this.configService.get<string>('USDC_ADDRESS');
      if (usdcAddress) {
        this.usdcContract = new Contract(usdcAddress, USDC_ABI, this.provider);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to initialize contracts: ${error.message}`);
    }
  }

  /**
   * Pre-Flight Check（200ms 内返回）
   * 
   * 注意：
   * 1. Onramp 费用承担方：用户承担（费用加在用户支付金额上）
   * 2. 兑换目标：统一兑换成 BSC 链的 USDC，进入分润佣金合约结算
   * 3. Provider 兑换后自动打入分润佣金合约，不是用户钱包
   */
  async check(
    userId: string,
    amount: number, // 原始金额
    currency: string, // 原始货币
  ): Promise<PreflightResult> {
    const startTime = Date.now();

    try {
      // 0. 货币转换：如果是法币，转换为 USDC
      let amountInUSDC = amount;
      // 支持的法币列表（包括新增的 INR 印度卢比）
      const isFiatCurrency = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'INR'].includes(currency.toUpperCase());
      
      if (isFiatCurrency) {
        // 法币需要转换为 USDC 才能检查 QuickPay 额度
        try {
          const rate = await this.exchangeRateService.getExchangeRate(currency, 'USDC');
          amountInUSDC = amount * rate;
          this.logger.log(`货币转换: ${amount} ${currency} = ${amountInUSDC} USDC (汇率: ${rate})`);
        } catch (error) {
          this.logger.warn(`汇率转换失败: ${error.message}，使用默认汇率`);
          // 使用默认汇率（INR 约为 0.012，即 1 INR ≈ 0.012 USD）
          const defaultRates: Record<string, number> = {
            'CNY': 0.142, // 1 CNY = 0.142 USDC
            'USD': 1.0,
            'EUR': 1.08,
            'GBP': 1.27,
            'JPY': 0.0067,
            'INR': 0.012, // 1 INR ≈ 0.012 USD
          };
          amountInUSDC = amount * (defaultRates[currency.toUpperCase()] || 1.0);
        }
        
        // 法币支付应该走 Provider 通道，但需要检查是否可以用 QuickPay（如果金额在限额内）
        // 这里不直接返回，继续检查 QuickPay 可用性
      }

      // 1. 获取用户钱包地址
      const wallet = await this.walletRepository.findOne({
        where: { userId, isDefault: true },
      });

      // 如果没有钱包，直接返回 Provider 选项（不检查 QuickPay）
      if (!wallet) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        const userKYCLevel = user?.kycLevel || KYCLevel.NONE;
        const needsKYC = userKYCLevel === KYCLevel.NONE;
        
        let providerOptions: ProviderOption[] | undefined;
        if (isFiatCurrency) {
          // 统一兑换目标：BSC 链的 USDC
          const targetCrypto = 'USDC';
          const targetChain = 'bsc';
          
          // 尝试从多个 Provider 获取实时报价
          const providerQuotes: Array<{
            providerId: string;
            providerName: string;
            fee: number;
            totalPrice: number;
            estimatedTime: string;
          }> = [];
          
          if (this.providerManagerService) {
            try {
              const onRampProviders = this.providerManagerService.getOnRampProviders();
              const quotePromises = onRampProviders.map(async (provider) => {
                try {
                  const quote = await provider.getQuote(amount, currency, targetCrypto);
                  const actualFee = quote.fee || 0;
                  // V3.0: 使用 quote.estimatedAmount 作为 totalPrice
                  // 对于 On-ramp，estimatedAmount 是用户需要支付的法币总额（包含手续费）
                  const totalPrice = quote.estimatedAmount || (amount + actualFee);
                  
                  return {
                    providerId: provider.id,
                    providerName: provider.name || provider.id,
                    fee: actualFee,
                    totalPrice: totalPrice,
                    estimatedTime: '2-5 minutes',
                  };
                } catch (error: any) {
                  this.logger.warn(`Failed to get quote from ${provider.id}: ${error.message}`);
                  return null;
                }
              });
              
              const quotes = await Promise.all(quotePromises);
              providerQuotes.push(...quotes.filter((q) => q !== null) as any[]);
              providerQuotes.sort((a, b) => a.totalPrice - b.totalPrice);
            } catch (error: any) {
              this.logger.warn(`Failed to get provider quotes: ${error.message}`);
            }
          }
          
          const commissionContractAddress = this.getCommissionContractAddress();
          
          if (providerQuotes.length > 0) {
            const bestQuote = providerQuotes[0];
            providerOptions = [
              {
                id: 'google',
                name: 'Google Pay',
                price: bestQuote.totalPrice,
                currency: currency,
                requiresKYC: needsKYC,
                provider: bestQuote.providerId,
                estimatedTime: bestQuote.estimatedTime,
                fee: bestQuote.fee, // 总费用
                providerFee: (bestQuote as any).providerFee, // Provider 费用
                agentrixFee: (bestQuote as any).agentrixFee, // Agentrix 平台费用
                commissionContractAddress: commissionContractAddress || undefined,
              },
              {
                id: 'apple',
                name: 'Apple Pay',
                price: bestQuote.totalPrice,
                currency: currency,
                requiresKYC: needsKYC,
                provider: bestQuote.providerId,
                estimatedTime: bestQuote.estimatedTime,
                fee: bestQuote.fee, // 总费用
                providerFee: (bestQuote as any).providerFee, // Provider 费用
                agentrixFee: (bestQuote as any).agentrixFee, // Agentrix 平台费用
                commissionContractAddress: commissionContractAddress || undefined,
              },
              {
                id: 'card',
                name: '银行卡支付',
                price: bestQuote.totalPrice,
                currency: currency,
                requiresKYC: needsKYC,
                provider: bestQuote.providerId,
                estimatedTime: bestQuote.estimatedTime,
                fee: bestQuote.fee, // 总费用
                providerFee: (bestQuote as any).providerFee, // Provider 费用
                agentrixFee: (bestQuote as any).agentrixFee, // Agentrix 平台费用
                commissionContractAddress: commissionContractAddress || undefined,
              },
              {
                id: 'local',
                name: '本地银行卡',
                price: bestQuote.totalPrice,
                currency: currency,
                requiresKYC: needsKYC,
                provider: bestQuote.providerId,
                estimatedTime: bestQuote.estimatedTime,
                fee: bestQuote.fee, // 总费用
                providerFee: (bestQuote as any).providerFee, // Provider 费用
                agentrixFee: (bestQuote as any).agentrixFee, // Agentrix 平台费用
                commissionContractAddress: commissionContractAddress || undefined,
              },
            ];
          } else {
            // 无法获取报价，显示"获取中"
            providerOptions = [
              {
                id: 'google',
                name: 'Google Pay',
                price: amount,
                currency: currency,
                requiresKYC: needsKYC,
                provider: 'transak',
                estimatedTime: '获取中...',
                fee: 0,
                commissionContractAddress: commissionContractAddress || undefined,
              },
              {
                id: 'apple',
                name: 'Apple Pay',
                price: amount,
                currency: currency,
                requiresKYC: needsKYC,
                provider: 'transak',
                estimatedTime: '获取中...',
                fee: 0,
                commissionContractAddress: commissionContractAddress || undefined,
              },
              {
                id: 'card',
                name: '银行卡支付',
                price: amount,
                currency: currency,
                requiresKYC: needsKYC,
                provider: 'transak',
                estimatedTime: '获取中...',
                fee: 0,
                commissionContractAddress: commissionContractAddress || undefined,
              },
              {
                id: 'local',
                name: '本地银行卡',
                price: amount,
                currency: currency,
                requiresKYC: needsKYC,
                provider: 'transak',
                estimatedTime: '获取中...',
                fee: 0,
                commissionContractAddress: commissionContractAddress || undefined,
              },
            ];
          }
        }
        
        return {
          recommendedRoute: 'crypto-rail',
          quickPayAvailable: false,
          requiresKYC: true,
          estimatedTime: '2-5 minutes',
          providerOptions,
        };
      }

      // 2. 并行查询（提高速度）
      const [balanceResult, sessions, user] = await Promise.all([
        this.getWalletBalance(wallet.walletAddress),
        this.getUserSessions(wallet.walletAddress),
        this.userRepository.findOne({ where: { id: userId } }),
      ]);

      const balance = balanceResult.balance;
      const isMockBalance = balanceResult.isMock;
      // 使用转换后的 USDC 金额（如果是法币，已经转换为 USDC）
      // 先四舍五入到 6 位小数，避免 parseUnits 精度错误
      // 使用 parseFloat 确保精度正确，避免浮点数精度问题
      const amountInUSDCFixed = parseFloat(amountInUSDC.toFixed(6));
      // 确保金额是有效的正数
      if (isNaN(amountInUSDCFixed) || amountInUSDCFixed <= 0) {
        throw new Error(`Invalid amount after conversion: ${amountInUSDC}`);
      }
      const amountBN = parseUnits(amountInUSDCFixed.toFixed(6), 6); // USDC 6 decimals

      // 3. 检查 QuickPay 可用性
      let quickPayAvailable = false;
      let sessionLimit: PreflightResult['sessionLimit'] | undefined;

      if (sessions && sessions.length > 0) {
        // 获取第一个活跃 Session
        for (const sessionId of sessions) {
          const session = await this.getSessionFromChain(sessionId);
          if (session && session.isActive) {
            // 检查每日限额重置
            const currentDate = Math.floor(Date.now() / 86400000);
            const sessionDate = Number(session.lastResetDate) / 86400;
            let usedToday = session.usedToday;

            if (currentDate > sessionDate) {
              // 每日限额已重置
              usedToday = BigInt(0);
            }

            const dailyRemaining = session.dailyLimit - usedToday;

            // 检查单笔限额和每日限额
            // 1. 金额必须 <= 单次限额
            // 2. 金额必须 <= 每日剩余限额
            // 3. 钱包余额必须足够（如果不是 mock）
            const withinSingleLimit = amountBN <= session.singleLimit;
            const withinDailyLimit = amountBN <= dailyRemaining;
            const hasBalance = isMockBalance || balance >= amountBN;

            this.logger.debug(
              `QuickPay检查: 金额=${formatUnits(amountBN, 6)} USDC, ` +
              `单次限额=${formatUnits(session.singleLimit, 6)}, ` +
              `每日剩余=${formatUnits(dailyRemaining, 6)}, ` +
              `单次通过=${withinSingleLimit}, 每日通过=${withinDailyLimit}, 余额足够=${hasBalance}`,
            );

            if (withinSingleLimit && withinDailyLimit && hasBalance) {
              quickPayAvailable = true;
              sessionLimit = {
                singleLimit: formatUnits(session.singleLimit, 6),
                dailyLimit: formatUnits(session.dailyLimit, 6),
                dailyRemaining: formatUnits(dailyRemaining, 6),
              };
              break;
            }
          }
        }
      }

      // 4. 路由决策（优先级：QuickPay > Wallet > Crypto-Rail）
      // 注意：如果用户有钱包且 QuickPay 激活且满足条件，应该优先推荐 QuickPay
      let recommendedRoute: PreflightResult['recommendedRoute'];
      let estimatedTime = '2-5 minutes';
      let fees: PreflightResult['fees'] | undefined;

      if (quickPayAvailable) {
        // 最高优先级：QuickPay（如果可用且满足条件）
        recommendedRoute = 'quickpay';
        estimatedTime = '< 1 second';
        fees = {
          gasFee: '0',
          providerFee: '0',
          total: '0',
        };
      } else if (!isMockBalance && balance >= amountBN) {
        // 第二优先级：钱包支付（如果余额足够）
        recommendedRoute = 'wallet';
        estimatedTime = '30-60 seconds';
        fees = {
          gasFee: '~$0.50',
          total: '~$0.50',
        };
      } else {
        // 最后选择：Crypto-Rail（Provider 支付）
        recommendedRoute = 'crypto-rail';
        estimatedTime = '2-5 minutes';
        fees = {
          providerFee: '~2.9%',
          total: `~$${(amount * 0.029).toFixed(2)}`,
        };
      }

      // 5. 如果是法币订单，计算各支付方式的价格和 KYC 要求
      let providerOptions: ProviderOption[] | undefined;
      if (isFiatCurrency) {
        const userKYCLevel = user?.kycLevel || KYCLevel.NONE;
        const needsKYC = userKYCLevel === KYCLevel.NONE;
        
        // 统一兑换目标：BSC 链的 USDC
        const targetCrypto = 'USDC';
        const targetChain = 'bsc';
        
        // 从多个 Provider 获取实时报价（费率会根据金额、链、币种变化）
        // 注意：不设置固定默认费率，如果无法获取报价，显示"获取中"或"暂不可用"
        let providerQuotes: Array<{
          providerId: string;
          providerName: string;
          fee: number;
          totalPrice: number;
          estimatedTime: string;
        }> = [];
        
        if (this.providerManagerService) {
          try {
            // 获取所有 On-ramp Provider 的报价
            const onRampProviders = this.providerManagerService.getOnRampProviders();
            
            // 并行获取所有 Provider 的报价，每个 Provider 设置 5 秒超时
            const quotePromises = onRampProviders.map(async (provider) => {
              try {
                // 为每个 Provider 设置超时（5秒）
                // V3.0: 使用 isSourceAmount: false，因为我们知道要收多少加密货币 (amount)
                // 这样 Provider 会返回用户需要支付的法币金额 (totalPrice)
                const quote = await Promise.race([
                  provider.getQuote(amount, currency, targetCrypto, false),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Quote timeout')), 5000)
                  ),
                ]) as any;
                
                const actualFee = quote.fee || 0;
                // 如果 isSourceAmount 为 false，estimatedAmount 就是用户需要支付的法币金额
                const totalPrice = quote.estimatedAmount || (amount + actualFee);
                
                return {
                  providerId: provider.id,
                  providerName: provider.name || provider.id,
                  fee: actualFee,
                  totalPrice: totalPrice,
                  estimatedTime: '2-5 minutes', // 可以从 quote 中获取，如果有的话
                };
              } catch (error: any) {
                this.logger.warn(
                  `Failed to get quote from ${provider.id}: ${error.message}`,
                );
                return null;
              }
            });
            
            // 使用 Promise.allSettled 而不是 Promise.all，避免一个失败导致全部失败
            const quoteResults = await Promise.allSettled(quotePromises);
            const quotes = quoteResults
              .filter((result) => result.status === 'fulfilled' && result.value !== null)
              .map((result) => (result as PromiseFulfilledResult<any>).value);
            providerQuotes.push(...quotes.filter((q) => q !== null) as any[]);
            
            // 应用 Agentrix 平台额外费用（如果配置了）
            if (this.onRampCommissionService) {
              providerQuotes = providerQuotes.map((quote) => {
                const commission = this.onRampCommissionService!.calculateOnRampCommission(
                  amount, // 商品价格
                  quote.fee, // Provider 费用
                );
                
                return {
                  ...quote,
                  fee: commission.totalFee, // 总费用（Provider + Agentrix）
                  totalPrice: commission.totalPrice, // 用户需要支付的总金额
                  providerFee: commission.providerFee, // Provider 费用（保留原始值）
                  agentrixFee: commission.agentrixFee, // Agentrix 平台费用
                };
              });
            }
            
            // 按总价排序（价格低的在前）
            providerQuotes.sort((a, b) => a.totalPrice - b.totalPrice);
            
            this.logger.log(
              `Got ${providerQuotes.length} provider quotes for ${amount} ${currency} -> ${targetCrypto} on ${targetChain}`,
            );
          } catch (error: any) {
            this.logger.warn(
              `Failed to get provider quotes: ${error.message}`,
            );
          }
        }
        
        // Provider 最低兑换金额限制（USD）
        const PROVIDER_MIN_AMOUNTS = {
          google: 20, // Google Pay 最低 20 USD
          apple: 30, // Apple Pay 最低 30 USD
          card: 5,    // Visa/MasterCard 最低 5 USD
          local: 5,   // 本地银行卡最低 5 USD
        };
        
        // 获取分润佣金合约地址
        const commissionContractAddress = this.getCommissionContractAddress();
        
        // 将金额转换为 USD 进行比较（用于最低金额检查）
        let amountInUSD = amount;
        if (currency.toUpperCase() !== 'USD') {
          try {
            // 获取汇率：currency -> USD
            const rateToUSD = await this.exchangeRateService.getExchangeRate(currency, 'USD');
            amountInUSD = amount * rateToUSD;
            this.logger.log(`金额转换用于最低金额检查: ${amount} ${currency} = ${amountInUSD} USD (汇率: ${rateToUSD})`);
          } catch (error) {
            // 使用默认汇率
            const defaultRatesToUSD: Record<string, number> = {
              'CNY': 0.14, // 1 CNY ≈ 0.14 USD
              'EUR': 1.08,
              'GBP': 1.27,
              'JPY': 0.0067,
            };
            const rate = defaultRatesToUSD[currency.toUpperCase()] || 1.0;
            amountInUSD = amount * rate;
            this.logger.warn(`使用默认汇率转换: ${amount} ${currency} = ${amountInUSD} USD (默认汇率: ${rate})`);
          }
        }
        
        // 构建支付方式选项
        // 如果获取到了 Provider 报价，使用最优报价；否则显示"获取中"
        if (providerQuotes.length > 0) {
          // 使用最优报价（价格最低的）
          const bestQuote = providerQuotes[0];
          
          providerOptions = [
            {
              id: 'google',
              name: 'Google Pay',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.google ? bestQuote.totalPrice : PROVIDER_MIN_AMOUNTS.google,
              currency: currency,
              requiresKYC: needsKYC,
              provider: bestQuote.providerId,
              estimatedTime: bestQuote.estimatedTime,
              fee: amountInUSD >= PROVIDER_MIN_AMOUNTS.google ? bestQuote.fee : 0, // 总费用
              providerFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.google ? ((bestQuote as any).providerFee || 0) : 0,
              agentrixFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.google ? ((bestQuote as any).agentrixFee || 0) : 0,
              commissionContractAddress: commissionContractAddress || undefined,
              minAmount: PROVIDER_MIN_AMOUNTS.google,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.google,
            },
            {
              id: 'apple',
              name: 'Apple Pay',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.apple ? bestQuote.totalPrice : PROVIDER_MIN_AMOUNTS.apple,
              currency: currency,
              requiresKYC: needsKYC,
              provider: bestQuote.providerId,
              estimatedTime: bestQuote.estimatedTime,
              fee: amountInUSD >= PROVIDER_MIN_AMOUNTS.apple ? bestQuote.fee : 0,
              providerFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.apple ? ((bestQuote as any).providerFee || 0) : 0,
              agentrixFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.apple ? ((bestQuote as any).agentrixFee || 0) : 0,
              commissionContractAddress: commissionContractAddress || undefined,
              minAmount: PROVIDER_MIN_AMOUNTS.apple,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.apple,
            },
            {
              id: 'card',
              name: '银行卡支付',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.card ? bestQuote.totalPrice : PROVIDER_MIN_AMOUNTS.card,
              currency: currency,
              requiresKYC: needsKYC,
              provider: bestQuote.providerId,
              estimatedTime: bestQuote.estimatedTime,
              fee: amountInUSD >= PROVIDER_MIN_AMOUNTS.card ? bestQuote.fee : 0,
              providerFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.card ? ((bestQuote as any).providerFee || 0) : 0,
              agentrixFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.card ? ((bestQuote as any).agentrixFee || 0) : 0,
              commissionContractAddress: commissionContractAddress || undefined,
              minAmount: PROVIDER_MIN_AMOUNTS.card,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.card,
            },
            {
              id: 'local',
              name: '本地银行卡',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.local ? bestQuote.totalPrice : PROVIDER_MIN_AMOUNTS.local,
              currency: currency,
              requiresKYC: needsKYC,
              provider: bestQuote.providerId,
              estimatedTime: bestQuote.estimatedTime,
              fee: amountInUSD >= PROVIDER_MIN_AMOUNTS.local ? bestQuote.fee : 0,
              providerFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.local ? ((bestQuote as any).providerFee || 0) : 0,
              agentrixFee: amountInUSD >= PROVIDER_MIN_AMOUNTS.local ? ((bestQuote as any).agentrixFee || 0) : 0,
              commissionContractAddress: commissionContractAddress || undefined,
              minAmount: PROVIDER_MIN_AMOUNTS.local,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.local,
            },
          ];
        } else {
          // 如果无法获取报价，显示"获取中"状态
          // 选项B：显示最低金额作为价格，并提示"不满足最低金额要求"
          providerOptions = [
            {
              id: 'google',
              name: 'Google Pay',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.google ? amount : PROVIDER_MIN_AMOUNTS.google, // 如果低于最低金额，显示最低金额
              currency: currency,
              requiresKYC: needsKYC,
              provider: 'transak',
              estimatedTime: '获取中...',
              fee: 0, // 0 表示未获取到报价或低于最低金额
              minAmount: PROVIDER_MIN_AMOUNTS.google,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.google,
              commissionContractAddress: commissionContractAddress || undefined,
            },
            {
              id: 'apple',
              name: 'Apple Pay',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.apple ? amount : PROVIDER_MIN_AMOUNTS.apple,
              currency: currency,
              requiresKYC: needsKYC,
              provider: 'transak',
              estimatedTime: '获取中...',
              fee: 0,
              minAmount: PROVIDER_MIN_AMOUNTS.apple,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.apple,
              commissionContractAddress: commissionContractAddress || undefined,
            },
            {
              id: 'card',
              name: '银行卡支付',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.card ? amount : PROVIDER_MIN_AMOUNTS.card,
              currency: currency,
              requiresKYC: needsKYC,
              provider: 'transak',
              estimatedTime: '获取中...',
              fee: 0,
              minAmount: PROVIDER_MIN_AMOUNTS.card,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.card,
              commissionContractAddress: commissionContractAddress || undefined,
            },
            {
              id: 'local',
              name: '本地银行卡',
              price: amountInUSD >= PROVIDER_MIN_AMOUNTS.local ? amount : PROVIDER_MIN_AMOUNTS.local,
              currency: currency,
              requiresKYC: needsKYC,
              provider: 'transak',
              estimatedTime: '获取中...',
              fee: 0,
              minAmount: PROVIDER_MIN_AMOUNTS.local,
              available: amountInUSD >= PROVIDER_MIN_AMOUNTS.local,
              commissionContractAddress: commissionContractAddress || undefined,
            },
          ];
        }
        
        // 按价格排序（价格低的在前）
        providerOptions.sort((a, b) => a.price - b.price);
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(`Pre-flight check completed in ${elapsed}ms`);

      return {
        recommendedRoute,
        quickPayAvailable,
        sessionLimit,
        walletBalance: isMockBalance ? '0' : formatUnits(balance, 6), // 如果是 mock，返回 0
        walletBalanceIsMock: isMockBalance, // 标记是否为 mock 值
        requiresKYC: user?.kycLevel === 'none',
        estimatedTime,
        fees,
        providerOptions,
      };
    } catch (error) {
      this.logger.error(`Pre-flight check failed: ${error.message}`);
      // 降级到默认路由
      const isFiatCurrency = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'INR'].includes(currency.toUpperCase());
      let providerOptions: ProviderOption[] | undefined;
      
      if (isFiatCurrency) {
        const providerFeeRate = 0.029; // 2.9%
        const totalPrice = amount * (1 + providerFeeRate);
        
        providerOptions = [
          {
            id: 'google',
            name: 'Google Pay',
            price: totalPrice,
            currency: currency,
            requiresKYC: true,
            provider: 'transak',
            estimatedTime: '2-5 minutes',
            fee: amount * providerFeeRate,
          },
          {
            id: 'apple',
            name: 'Apple Pay',
            price: totalPrice,
            currency: currency,
            requiresKYC: true,
            provider: 'transak',
            estimatedTime: '2-5 minutes',
            fee: amount * providerFeeRate,
          },
          {
            id: 'card',
            name: '银行卡支付',
            price: totalPrice,
            currency: currency,
            requiresKYC: true,
            provider: 'transak',
            estimatedTime: '2-5 minutes',
            fee: amount * providerFeeRate,
          },
          {
            id: 'local',
            name: '本地银行卡',
            price: totalPrice,
            currency: currency,
            requiresKYC: true,
            provider: 'transak',
            estimatedTime: '2-5 minutes',
            fee: amount * providerFeeRate,
          },
        ];
      }
      
      return {
        recommendedRoute: 'crypto-rail',
        quickPayAvailable: false,
        requiresKYC: true,
        estimatedTime: '2-5 minutes',
        providerOptions,
      };
    }
  }

  /**
   * 获取钱包余额（链上查询）
   */
  private async getWalletBalance(walletAddress: string): Promise<{ balance: bigint; isMock: boolean }> {
    if (!this.usdcContract) {
      // Mock mode - 返回 0 而不是默认值，避免误导用户
      return { balance: BigInt(0), isMock: true };
    }

    try {
      const balance = await this.usdcContract.balanceOf(walletAddress);
      return { balance, isMock: false };
    } catch (error: any) {
      this.logger.warn(`Failed to get balance: ${error.message}`);
      return { balance: BigInt(0), isMock: true };
    }
  }

  /**
   * 获取用户的所有 Session（链上查询）
   */
  private async getUserSessions(walletAddress: string): Promise<string[]> {
    if (!this.sessionManagerContract) {
      return [];
    }

    try {
      return await this.sessionManagerContract.getUserSessions(walletAddress);
    } catch (error) {
      this.logger.warn(`Failed to get user sessions: ${error.message}`);
      return [];
    }
  }

  /**
   * 从链上获取 Session 信息
   */
  private async getSessionFromChain(sessionId: string): Promise<{
    signer: string;
    owner: string;
    singleLimit: bigint;
    dailyLimit: bigint;
    usedToday: bigint;
    expiry: bigint;
    lastResetDate: bigint;
    isActive: boolean;
  } | null> {
    if (!this.sessionManagerContract) {
      return null;
    }

    try {
      const session = await this.sessionManagerContract.sessions(sessionId);
      return {
        signer: session.signer,
        owner: session.owner,
        singleLimit: session.singleLimit,
        dailyLimit: session.dailyLimit,
        usedToday: session.usedToday,
        expiry: session.expiry,
        lastResetDate: session.lastResetDate,
        isActive: session.isActive,
      };
    } catch (error) {
      this.logger.warn(`Failed to get session: ${error.message}`);
      return null;
    }
  }
}

