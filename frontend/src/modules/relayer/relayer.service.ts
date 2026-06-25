import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Wallet, Contract, parseUnits, formatUnits, formatEther, keccak256, AbiCoder, toUtf8Bytes, concat, recoverAddress, zeroPadValue, toBeHex, solidityPackedKeccak256, getBytes } from 'ethers';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

interface QuickPayRequest {
  sessionId: string;
  paymentId: string; // 用于查询支付记录
  orderId?: string; // 可选：用于签名验证（前端签名时使用的是订单ID）
  to: string;
  amount: string; // Token amount (实际精度，可能是 6 或 18 decimals)
  tokenDecimals?: number; // 可选：token 的精度（默认 6）
  signature: string;
  nonce: number;
}

interface QueuedPayment {
  request: QuickPayRequest;
  timestamp: number;
  retryCount: number;
}

// ERC8004SessionManager ABI (简化版，只包含必要函数)
const ERC8004_ABI = [
  'function getSession(bytes32) view returns (tuple(address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive))',
  'function executeWithSession(bytes32, address, uint256, bytes32, bytes)',
  'function executeBatchWithSession(bytes32[], address[], uint256[], bytes32[], bytes[])',
  'event PaymentExecuted(bytes32 indexed sessionId, address indexed to, uint256 amount, bytes32 indexed paymentId)',
];

@Injectable()
export class AgentrixRelayerService {
  private readonly logger = new Logger(AgentrixRelayerService.name);
  private relayerWallet: Wallet;
  private provider: JsonRpcProvider;
  private sessionManagerContract: Contract | null = null;
  private paymentQueue: QueuedPayment[] = [];
  private nonceManager: Map<string, number> = new Map(); // sessionId -> lastNonce
  private isProcessingBatch = false;

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private configService: ConfigService,
  ) {
    // 异步初始化，不阻塞构造函数
    this.initializeRelayer().catch((error) => {
      this.logger.error(`Failed to initialize relayer: ${error.message}`);
    });
    this.startBatchProcessor();
  }

  /**
   * 初始化 Relayer（EOA 钱包、Provider、合约）
   */
  private async initializeRelayer() {
    try {
      // 初始化 Provider
      // 优先使用 BSC_TESTNET_RPC_URL，如果没有则使用 RPC_URL，最后使用默认值
      const rpcUrl = this.configService.get<string>('BSC_TESTNET_RPC_URL') 
        || this.configService.get<string>('RPC_URL') 
        || 'http://localhost:8545';
      this.logger.log(`Initializing Relayer with RPC: ${rpcUrl}`);
      this.provider = new JsonRpcProvider(rpcUrl);

      // 初始化 Relayer 钱包（用于付 Gas）
      const relayerPrivateKey = this.configService.get<string>('RELAYER_PRIVATE_KEY');
      if (!relayerPrivateKey) {
        this.logger.warn('RELAYER_PRIVATE_KEY not set, using mock wallet');
        const randomWallet = Wallet.createRandom();
        this.relayerWallet = new Wallet(randomWallet.privateKey, this.provider);
      } else {
        // 检查私钥格式（应该是0x开头的66个字符）
        const trimmedKey = relayerPrivateKey.trim();
        if (!trimmedKey.startsWith('0x') || trimmedKey.length !== 66) {
          this.logger.error(`Invalid RELAYER_PRIVATE_KEY format: ${trimmedKey.substring(0, 10)}... (should be 0x + 64 hex chars)`);
          throw new Error('Invalid RELAYER_PRIVATE_KEY format');
        }
        this.relayerWallet = new Wallet(trimmedKey, this.provider);
        this.logger.log(`Relayer wallet initialized: ${this.relayerWallet.address}`);
      }

      // 初始化合约
      const contractAddress = this.configService.get<string>('ERC8004_CONTRACT_ADDRESS');
      this.logger.log(`ERC8004_CONTRACT_ADDRESS from config: ${contractAddress ? contractAddress.substring(0, 20) + '...' : 'NOT SET'}`);
      
      if (!contractAddress) {
        this.logger.warn('ERC8004_CONTRACT_ADDRESS not set, relayer will use mock mode');
        return;
      }

      // 检查合约地址格式
      const trimmedAddress = contractAddress.trim();
      if (!trimmedAddress.startsWith('0x') || trimmedAddress.length !== 42) {
        this.logger.error(`Invalid ERC8004_CONTRACT_ADDRESS format: ${trimmedAddress} (should be 0x + 40 hex chars)`);
        this.logger.warn('Invalid contract address format, relayer will use mock mode');
        return;
      }

      // 尝试初始化合约
      try {
        this.sessionManagerContract = new Contract(
          trimmedAddress,
          ERC8004_ABI,
          this.relayerWallet,
        );
        
        // 验证合约是否可访问（尝试读取一个view函数）
        this.logger.log(`Contract initialized, verifying connection...`);
        
        // 检查 Relayer 钱包余额
        const balance = await this.relayerWallet.provider.getBalance(this.relayerWallet.address);
        this.logger.log(`✅ Relayer initialized successfully with contract: ${trimmedAddress}`);
        this.logger.log(`   Relayer wallet: ${this.relayerWallet.address}`);
        this.logger.log(`   Relayer wallet balance: ${formatEther(balance)} BNB`);
        this.logger.log(`   RPC URL: ${rpcUrl}`);
        if (balance === 0n) {
          this.logger.error(`   ⚠️  Relayer wallet has zero balance! Cannot pay for gas.`);
          this.logger.error(`   💡 Please send BNB to: ${this.relayerWallet.address}`);
        } else if (Number(balance) < parseUnits('0.001', 18)) {
          this.logger.warn(`   ⚠️  Relayer wallet balance is low (${formatEther(balance)} BNB), may not be enough for multiple transactions.`);
        }
      } catch (contractError) {
        this.logger.error(`Failed to initialize contract: ${contractError.message}`);
        this.logger.warn('Contract initialization failed, relayer will use mock mode');
        this.sessionManagerContract = null;
      }
    } catch (error) {
      this.logger.error(`Failed to initialize relayer: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      this.sessionManagerContract = null;
    }
  }

  /**
   * 处理 QuickPay 请求（链下验证 + 即时确认）
   */
  async processQuickPay(dto: QuickPayRequest): Promise<{
    success: boolean;
    paymentId: string;
    confirmedAt: Date;
    txHash?: string;
  }> {
    try {
      // 0. 修复零地址问题：如果 to 地址为零地址，使用 Commission 合约地址
      // 必须在签名验证之前修复，因为签名验证需要使用正确的地址
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      if (dto.to.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
        const commissionAddress = this.configService.get<string>('COMMISSION_CONTRACT_ADDRESS');
        
        if (!commissionAddress) {
          this.logger.error('❌ COMMISSION_CONTRACT_ADDRESS 未配置');
          throw new BadRequestException('Commission合约地址未配置，请联系管理员');
        }
        
        this.logger.log(`✅ 检测到零地址，使用 Commission 合约地址: ${commissionAddress}`);
        dto.to = commissionAddress;
      }

      // 1. 防重放检查
      const lastNonce = this.nonceManager.get(dto.sessionId) || 0;
      if (dto.nonce <= lastNonce) {
        throw new BadRequestException('Invalid nonce (replay attack)');
      }

      // 2. 链下验证签名（毫秒级）
      const isValid = await this.verifySessionSignature(dto);
      if (!isValid) {
        throw new BadRequestException('Invalid signature');
      }

      // 3. 链上查询 Session 状态（缓存 + 链上验证）
      const session = await this.getSessionFromChain(dto.sessionId);
      if (!session.isActive) {
        throw new BadRequestException('Session not active');
      }

      // 4. 检查额度（链下缓存 + 链上验证）
      // Session 限额是 6 decimals（USDC），需要将支付金额转换为 6 decimals 再比较
      const amount = BigInt(dto.amount);
      const tokenDecimals = dto.tokenDecimals || 6; // 默认 6 decimals (USDC)
      const sessionDecimals = 6; // Session 限额使用 6 decimals
      
      // 将支付金额转换为 Session 的精度（6 decimals）
      let amountInSessionDecimals: bigint;
      if (tokenDecimals > sessionDecimals) {
        // 从高精度转换为低精度（例如：18 -> 6，除以 10^12）
        const diff = tokenDecimals - sessionDecimals;
        let scaleFactor = BigInt(1);
        for (let i = 0; i < diff; i++) {
          scaleFactor = scaleFactor * BigInt(10);
        }
        amountInSessionDecimals = amount / scaleFactor;
      } else if (tokenDecimals < sessionDecimals) {
        // 从低精度转换为高精度（例如：6 -> 18，乘以 10^12）
        const diff = sessionDecimals - tokenDecimals;
        let scaleFactor = BigInt(1);
        for (let i = 0; i < diff; i++) {
          scaleFactor = scaleFactor * BigInt(10);
        }
        amountInSessionDecimals = amount * scaleFactor;
      } else {
        // 精度相同，直接使用
        amountInSessionDecimals = amount;
      }
      
      if (amountInSessionDecimals > session.singleLimit) {
        this.logger.debug(`Amount check: ${amountInSessionDecimals} > ${session.singleLimit} (tokenDecimals: ${tokenDecimals}, amount: ${dto.amount})`);
        throw new BadRequestException('Exceeds single limit');
      }

      // 检查每日限额（需要重置逻辑）
      const currentDate = Math.floor(Date.now() / 86400000); // days since epoch
      const sessionDate = Number(session.lastResetDate) / 86400;
      let usedToday = session.usedToday;

      if (currentDate > sessionDate) {
        // 每日限额已重置，需要从链上重新获取
        const updatedSession = await this.getSessionFromChain(dto.sessionId);
        usedToday = updatedSession.usedToday;
      }

      // 使用转换后的金额（6 decimals）检查每日限额
      if (usedToday + amountInSessionDecimals > session.dailyLimit) {
        this.logger.debug(`Daily limit check: ${usedToday} + ${amountInSessionDecimals} > ${session.dailyLimit}`);
        throw new BadRequestException('Exceeds daily limit');
      }

      // 5. 更新支付记录状态（即时确认）
      const payment = await this.paymentRepository.findOne({
        where: { id: dto.paymentId },
      });

      if (payment) {
        payment.status = PaymentStatus.COMPLETED;
        payment.metadata = {
          ...payment.metadata,
          quickPayConfirmed: true,
          confirmedAt: new Date().toISOString(),
          sessionId: dto.sessionId,
        };
        await this.paymentRepository.save(payment);
      }

      // 5. 更新 Nonce
      this.nonceManager.set(dto.sessionId, dto.nonce);

      // 6. 立即执行单笔支付（不等待批量处理）
      let txHash: string | undefined;
      try {
        if (this.sessionManagerContract) {
          // 有合约：立即执行单笔支付
          this.logger.log(`Attempting immediate on-chain execution for paymentId=${dto.paymentId}`);
          this.logger.log(`Contract address: ${await this.sessionManagerContract.getAddress()}`);
          this.logger.log(`Session ID: ${dto.sessionId}`);
          this.logger.log(`To: ${dto.to}`);
          this.logger.log(`Amount: ${dto.amount}`);
          
          txHash = await this.executeSinglePaymentOnChain(dto);
          this.logger.log(
            `✅ QuickPay executed immediately: paymentId=${dto.paymentId}, txHash=${txHash}`,
          );
        } else {
          // Mock模式：立即处理（不等待批量处理）
          this.logger.warn('Session manager contract not initialized, processing immediately in mock mode');
          // 立即执行Mock处理
          await this.executeBatchOnChain([dto]);
          this.logger.log(`Mock mode: Payment ${dto.paymentId} processed immediately`);
        }
      } catch (error: any) {
        this.logger.error(`❌ Immediate execution failed for paymentId=${dto.paymentId}: ${error.message}`);
        this.logger.error(`Error stack: ${error.stack}`);
        
        // 如果立即执行失败，尝试Mock模式处理
        if (!this.sessionManagerContract) {
          try {
            await this.executeBatchOnChain([dto]);
            this.logger.log(`Mock mode fallback: Payment ${dto.paymentId} processed`);
          } catch (mockError: any) {
            this.logger.error(`Mock mode fallback also failed: ${mockError.message}`);
            // 最后加入队列等待重试
            this.paymentQueue.push({
              request: dto,
              timestamp: Date.now(),
              retryCount: 0,
            });
          }
        } else {
          // 有合约但执行失败，记录详细错误并加入队列等待重试
          this.logger.error(`Contract exists but execution failed. Contract address: ${await this.sessionManagerContract.getAddress()}`);
          this.logger.error(`Relayer wallet: ${this.relayerWallet.address}`);
          this.logger.error(`Relayer wallet balance: ${await this.relayerWallet.provider.getBalance(this.relayerWallet.address)}`);
          
          // 检查是否是余额不足
          const balance = await this.relayerWallet.provider.getBalance(this.relayerWallet.address);
          if (balance === 0n) {
            this.logger.error('⚠️ Relayer wallet has zero balance! Cannot pay for gas.');
            // 标记payment为失败
            if (payment) {
              payment.status = PaymentStatus.FAILED;
              payment.metadata = {
                ...payment.metadata,
                executionFailed: true,
                error: 'Relayer wallet has zero balance',
              };
              await this.paymentRepository.save(payment);
            }
          } else {
            // 加入队列等待重试
            this.paymentQueue.push({
              request: dto,
              timestamp: Date.now(),
              retryCount: 0,
            });
            this.logger.log(`Payment ${dto.paymentId} added to retry queue`);
          }
        }
      }

      // 8. 即时返回成功（商户可发货）
      const confirmedAt = new Date();

      this.logger.log(
        `QuickPay confirmed: paymentId=${dto.paymentId}, amount=${formatUnits(amount, 6)} USDC, txHash=${txHash || 'pending'}`,
      );

      return {
        success: true,
        paymentId: dto.paymentId,
        confirmedAt,
        txHash,
      };
    } catch (error) {
      this.logger.error(`QuickPay failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 验证 Session Key 签名（链下，毫秒级）
   */
  private async verifySessionSignature(dto: QuickPayRequest): Promise<boolean> {
    try {
      if (!this.sessionManagerContract) {
        // Mock mode: 跳过签名验证
        this.logger.warn('Session manager contract not initialized, skipping signature verification');
        return true;
      }

      // 构建消息哈希（与合约一致）
      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);
      const abiCoder = AbiCoder.defaultAbiCoder();
      
      // 使用 orderId 进行签名验证（如果提供），否则使用 paymentId
      // 前端签名时使用的是订单ID，所以这里也要使用订单ID
      const idForSignature = dto.orderId || dto.paymentId;
      
      if (!idForSignature) {
        this.logger.error('签名验证失败：缺少 orderId 或 paymentId');
        return false;
      }
      
      // 将 ID 字符串转换为 bytes32
      // 如果 ID 是十六进制字符串，直接使用；否则使用 keccak256 哈希
      let paymentIdBytes32: string;
      if (idForSignature.startsWith('0x') && idForSignature.length === 66) {
        paymentIdBytes32 = zeroPadValue(idForSignature, 32);
      } else {
        // 将字符串哈希为 bytes32（与前端一致：ethers.keccak256(ethers.toUtf8Bytes(order.id))）
        paymentIdBytes32 = keccak256(toUtf8Bytes(idForSignature));
      }
      
      // 确保 sessionId 是有效的 bytes32 格式
      if (!dto.sessionId || !dto.sessionId.startsWith('0x') || dto.sessionId.length !== 66) {
        this.logger.error(`签名验证失败：sessionId 格式无效: ${dto.sessionId}`);
        return false;
      }
      
      // 合约期望的金额是 6 decimals（USDC标准），前端签名时也使用 6 decimals
      // 所以验证签名时也需要将金额转换为 6 decimals，与前端保持一致
      const tokenDecimals = dto.tokenDecimals || 6; // 默认 6 decimals (USDC)
      const contractDecimals = 6; // 合约期望 6 decimals
      
      let amountForSignature: bigint;
      if (tokenDecimals > contractDecimals) {
        // 从高精度转换为低精度（例如：18 -> 6，除以 10^12）
        const diff = tokenDecimals - contractDecimals;
        let scaleFactor = BigInt(1);
        for (let i = 0; i < diff; i++) {
          scaleFactor = scaleFactor * BigInt(10);
        }
        amountForSignature = BigInt(dto.amount) / scaleFactor;
      } else if (tokenDecimals < contractDecimals) {
        // 从低精度转换为高精度（例如：6 -> 18，乘以 10^12）
        const diff = contractDecimals - tokenDecimals;
        let scaleFactor = BigInt(1);
        for (let i = 0; i < diff; i++) {
          scaleFactor = scaleFactor * BigInt(10);
        }
        amountForSignature = BigInt(dto.amount) * scaleFactor;
      } else {
        // 精度相同，直接使用
        amountForSignature = BigInt(dto.amount);
      }
      
      // 验证签名时使用 dto.to 地址（前端应该已经使用正确的 Commission 合约地址签名）
      // 如果前端传递的是零地址，说明前端配置错误，应该报错
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      if (dto.to.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
        this.logger.error('前端传递了零地址，这是不允许的。前端应该从后端获取Commission合约地址。');
        throw new BadRequestException('收款地址无效，请刷新页面重试');
      }
      
      // 只使用 dto.to 地址进行验证（前端应该已经使用正确的地址签名）
      const addressesToTry = [dto.to];
      
      // 从链上获取 Session 信息，验证 signer
      const session = await this.getSessionFromChain(dto.sessionId);
      
      // 尝试每个地址进行签名验证
      for (const addressForVerification of addressesToTry) {
        // 合约使用 abi.encodePacked 构建 messageHash，我们需要使用 solidityPackedKeccak256 来匹配
        // 合约逻辑：keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(sessionId, to, amount, paymentId, chainId))))
        const innerHash = solidityPackedKeccak256(
          ['bytes32', 'address', 'uint256', 'bytes32', 'uint256'],
          [
            dto.sessionId,
            addressForVerification,
            amountForSignature, // 使用转换后的金额（6 decimals，与前端一致）
            paymentIdBytes32,
            chainId,
          ],
        );

        // 合约添加 EIP-191 前缀的方式：keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerHash))
        const messageHashWithPrefix = solidityPackedKeccak256(
          ['string', 'bytes32'],
          ['\x19Ethereum Signed Message:\n32', innerHash],
        );

        // 恢复签名者地址
        const signerAddress = recoverAddress(
          messageHashWithPrefix,
          dto.signature,
        );
        
        // 添加详细日志用于调试
        this.logger.debug(`Signature verification attempt with address: ${addressForVerification}`);
        this.logger.debug(`  sessionId: ${dto.sessionId}`);
        this.logger.debug(`  original to: ${dto.to}`);
        this.logger.debug(`  original amount: ${dto.amount} (${tokenDecimals} decimals)`);
        this.logger.debug(`  amount for signature: ${amountForSignature.toString()} (${contractDecimals} decimals)`);
        this.logger.debug(`  orderId: ${dto.orderId || 'N/A'}`);
        this.logger.debug(`  paymentId: ${dto.paymentId}`);
        this.logger.debug(`  paymentIdBytes32: ${paymentIdBytes32}`);
        this.logger.debug(`  chainId: ${chainId}`);
        this.logger.debug(`  innerHash: ${innerHash}`);
        this.logger.debug(`  messageHashWithPrefix: ${messageHashWithPrefix}`);
        this.logger.debug(`  recovered signer: ${signerAddress}`);
        this.logger.debug(`  expected signer: ${session.signer}`);
        
        // 如果签名验证通过，返回 true
        if (signerAddress.toLowerCase() === session.signer.toLowerCase()) {
          this.logger.debug(`✅ Signature verification passed with address: ${addressForVerification}`);
          return true;
        }
      }
      
      // 所有地址都验证失败
      this.logger.debug(`❌ Signature verification failed with all addresses`);
      return false;
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
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
  }> {
    if (!this.sessionManagerContract) {
      // Mock mode: 返回模拟数据
      return {
        signer: '0x0000000000000000000000000000000000000000',
        owner: '0x0000000000000000000000000000000000000000',
        singleLimit: parseUnits('1000', 6),
        dailyLimit: parseUnits('10000', 6),
        usedToday: BigInt(0),
        expiry: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
        lastResetDate: BigInt(Math.floor(Date.now() / 86400)),
        isActive: true,
      };
    }

    const session = await this.sessionManagerContract.getSession(sessionId);
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
  }

  /**
   * 批量上链处理器（定时执行）
   */
  private startBatchProcessor() {
    this.logger.log('Batch processor started (30s interval)');
    
    // 每 30 秒执行一次批量上链
    setInterval(async () => {
      if (this.isProcessingBatch) {
        this.logger.debug('Batch processor is already processing, skipping');
        return;
      }
      
      if (this.paymentQueue.length === 0) {
        return;
      }

      this.logger.log(`Batch processor triggered: ${this.paymentQueue.length} payments in queue`);

      // 积累最多 10 笔或立即上链（如果队列中有超过 5 分钟的支付）
      const now = Date.now();
      const oldPayments = this.paymentQueue.filter(
        (p) => now - p.timestamp > 5 * 60 * 1000,
      );
      const batchSize = Math.min(10, this.paymentQueue.length);

      const batch =
        oldPayments.length > 0
          ? oldPayments.slice(0, batchSize)
          : this.paymentQueue.slice(0, batchSize);

      if (batch.length === 0) return;

      this.isProcessingBatch = true;
      this.logger.log(`Processing batch: ${batch.length} payments`);

      try {
        await this.executeBatchOnChain(batch.map((p) => p.request));
        // 从队列中移除已处理的支付
        this.paymentQueue = this.paymentQueue.filter((p) => !batch.includes(p));
        this.logger.log(`✅ Batch executed successfully: ${batch.length} payments`);
      } catch (error) {
        this.logger.error(`❌ Batch execution failed: ${error.message}`, error.stack);
        // 重试逻辑
        batch.forEach((p) => {
          p.retryCount++;
          if (p.retryCount < 3) {
            // 重新加入队列
            this.paymentQueue.push(p);
            this.logger.warn(`Payment ${p.request.paymentId} retry ${p.retryCount}/3`);
          } else {
            this.logger.error(`Payment ${p.request.paymentId} failed after 3 retries, removing from queue`);
            // 标记payment为失败
            this.paymentRepository.findOne({ where: { id: p.request.paymentId } }).then(payment => {
              if (payment) {
                payment.status = PaymentStatus.FAILED;
                payment.metadata = {
                  ...payment.metadata,
                  batchProcessingFailed: true,
                  retryCount: p.retryCount,
                };
                this.paymentRepository.save(payment);
              }
            });
          }
        });
      } finally {
        this.isProcessingBatch = false;
      }
    }, 30000); // 30 秒
  }

  /**
   * 立即执行单笔支付（不等待批量处理）
   */
  private async executeSinglePaymentOnChain(dto: QuickPayRequest): Promise<string> {
    if (!this.sessionManagerContract) {
      throw new Error('Session manager contract not initialized');
    }

    this.logger.log(`Executing single payment on-chain: paymentId=${dto.paymentId}`);

    try {
      // 检查relayer钱包余额
      const balance = await this.relayerWallet.provider.getBalance(this.relayerWallet.address);
      this.logger.log(`Relayer wallet balance: ${formatEther(balance)} ETH`);
      
      if (balance === 0n) {
        throw new Error('Relayer wallet has zero balance, cannot pay for gas');
      }

      // 使用 orderId 进行链上执行（如果提供），否则使用 paymentId
      // 前端签名时使用的是订单ID，所以链上执行时也要使用订单ID
      const idForExecution = dto.orderId || dto.paymentId;
      
      // 将 ID 字符串转换为 bytes32
      let paymentIdBytes32: string;
      if (idForExecution.startsWith('0x') && idForExecution.length === 66) {
        paymentIdBytes32 = zeroPadValue(idForExecution, 32);
      } else {
        paymentIdBytes32 = keccak256(toUtf8Bytes(idForExecution));
      }

      // ⚠️ 重要：合约的amount参数是6 decimals（用于签名验证和限额检查）
      // 合约内部会自动将6 decimals转换为代币的实际精度（18 decimals for USDT）进行转账
      // 所以后端调用合约时，需要将代币金额转换为6 decimals，与签名验证保持一致
      const tokenDecimals = dto.tokenDecimals || 18; // USDT是18 decimals
      const contractDecimals = 6; // 合约期望6 decimals（用于签名验证和限额检查）
      
      // 将代币金额转换为合约期望的6 decimals（与签名验证保持一致）
      let amountForContract: bigint;
      if (tokenDecimals > contractDecimals) {
        // 从高精度转换为低精度（例如：18 -> 6，除以 10^12）
        const diff = tokenDecimals - contractDecimals;
        let scaleFactor = BigInt(1);
        for (let i = 0; i < diff; i++) {
          scaleFactor = scaleFactor * BigInt(10);
        }
        amountForContract = BigInt(dto.amount) / scaleFactor;
      } else if (tokenDecimals < contractDecimals) {
        // 从低精度转换为高精度（例如：6 -> 18，乘以 10^12）
        const diff = contractDecimals - tokenDecimals;
        let scaleFactor = BigInt(1);
        for (let i = 0; i < diff; i++) {
          scaleFactor = scaleFactor * BigInt(10);
        }
        amountForContract = BigInt(dto.amount) * scaleFactor;
      } else {
        // 精度相同，直接使用
        amountForContract = BigInt(dto.amount);
      }

      this.logger.log(`Calling executeWithSession with:`);
      this.logger.log(`  sessionId: ${dto.sessionId}`);
      this.logger.log(`  to: ${dto.to}`);
      this.logger.log(`  original amount: ${dto.amount} (${tokenDecimals} decimals)`);
      this.logger.log(`  contract amount: ${amountForContract.toString()} (${contractDecimals} decimals, 合约会自动转换为${tokenDecimals} decimals进行转账)`);
      this.logger.log(`  paymentIdBytes32: ${paymentIdBytes32}`);
      this.logger.log(`  signature: ${dto.signature.substring(0, 20)}...`);

      // 先使用 staticCall 模拟执行，获取 revert reason
      try {
        await this.sessionManagerContract.executeWithSession.staticCall(
          dto.sessionId,
          dto.to,
          amountForContract,
          paymentIdBytes32,
          dto.signature,
        );
        this.logger.log(`✅ Static call succeeded, proceeding with actual transaction`);
      } catch (staticCallError: any) {
        this.logger.error(`❌ Static call failed: ${staticCallError.message}`);
        if (staticCallError.reason) {
          this.logger.error(`Revert reason: ${staticCallError.reason}`);
        }
        if (staticCallError.data) {
          this.logger.error(`Error data: ${staticCallError.data}`);
        }
        // Static call 失败说明交易会 revert，直接抛出错误，不要继续执行
        throw new Error(`Transaction will revert: ${staticCallError.reason || staticCallError.message}. Please check: Session status, signature validation, or limit checks.`);
      }

      // 调用合约执行单笔支付（使用转换后的金额）
      const tx = await this.sessionManagerContract.executeWithSession(
        dto.sessionId,
        dto.to,
        amountForContract, // 使用转换后的金额（6 decimals）
        paymentIdBytes32,
        dto.signature,
        {
          gasLimit: 500000, // 估算 Gas
        },
      );

      const txHash = tx.hash;
      this.logger.log(`Transaction sent, waiting for confirmation: ${txHash}`);
      this.logger.log(`Transaction details: from=${tx.from}, to=${tx.to}, value=${tx.value}, gasLimit=${tx.gasLimit}`);
      
      // 验证交易是否真的被广播（检查交易是否在 mempool 中）
      try {
        const txInMempool = await this.relayerWallet.provider.getTransaction(txHash);
        if (!txInMempool) {
          this.logger.error(`❌ Transaction not found in mempool: ${txHash}`);
          throw new Error(`Transaction not broadcasted: ${txHash}`);
        }
        this.logger.log(`✅ Transaction confirmed in mempool: ${txHash}`);
      } catch (mempoolError: any) {
        this.logger.error(`❌ Failed to verify transaction in mempool: ${mempoolError.message}`);
        // 继续等待 receipt，可能只是网络延迟
      }

      const receipt = await tx.wait();
      // 在 ethers v6 中，receipt 可能没有 transactionHash，使用 tx.hash
      const finalTxHash = receipt.hash || receipt.transactionHash || txHash;
      
      // 检查交易状态（重要：确认交易是否真的成功）
      const status = receipt.status;
      if (status === 0) {
        this.logger.error(`❌ Transaction failed: txHash=${finalTxHash}`);
        throw new Error(`Transaction reverted: ${finalTxHash}`);
      }
      
      // 检查是否有 PaymentExecuted 事件（确认转账真的执行了）
      try {
        const paymentExecutedEvent = receipt.logs?.find((log: any) => {
          try {
            const parsed = this.sessionManagerContract.interface.parseLog(log);
            return parsed?.name === 'PaymentExecuted';
          } catch {
            return false;
          }
        });
        
        if (!paymentExecutedEvent) {
          this.logger.error(`❌ PaymentExecuted event not found in transaction: ${finalTxHash}`);
          this.logger.error(`❌ 这可能意味着转账没有执行，交易可能 revert 了`);
          this.logger.error(`❌ 请检查：1. Session 状态 2. 签名验证 3. 限额检查`);
          // 如果没有 PaymentExecuted 事件，说明转账没有执行，应该抛出错误
          throw new Error(`Transaction succeeded but PaymentExecuted event not found. This means the transfer did not execute. Possible reasons: Session validation failed, signature invalid, or limit exceeded.`);
        } else {
          const parsed = this.sessionManagerContract.interface.parseLog(paymentExecutedEvent);
          this.logger.log(`✅ PaymentExecuted event found: sessionId=${parsed.args[0]}, to=${parsed.args[1]}, amount=${parsed.args[2]}`);
        }
      } catch (eventError) {
        this.logger.warn(`无法解析PaymentExecuted事件: ${eventError.message}`);
      }
      
      this.logger.log(
        `✅ Single payment executed: txHash=${finalTxHash}, status=${status}, gasUsed=${receipt.gasUsed}, blockNumber=${receipt.blockNumber}`,
      );

      // 更新支付记录的 transactionHash
      const paymentRecord = await this.paymentRepository.findOne({
        where: { id: dto.paymentId },
      });
      if (paymentRecord) {
        paymentRecord.transactionHash = finalTxHash;
        paymentRecord.metadata = {
          ...paymentRecord.metadata,
          executedAt: new Date().toISOString(),
          blockNumber: receipt.blockNumber?.toString() || null,
          gasUsed: receipt.gasUsed?.toString() || null,
        };
        await this.paymentRepository.save(paymentRecord);
        this.logger.log(`Payment record updated with txHash: ${finalTxHash}`);
      }

      return finalTxHash;
    } catch (error: any) {
      this.logger.error(`❌ Single payment execution failed: ${error.message}`);
      this.logger.error(`Error code: ${error.code}`);
      this.logger.error(`Error data: ${error.data}`);
      if (error.reason) {
        this.logger.error(`Error reason: ${error.reason}`);
      }
      if (error.transaction) {
        this.logger.error(`Failed transaction: ${JSON.stringify(error.transaction)}`);
      }
      throw error;
    }
  }

  /**
   * 批量上链执行
   */
  private async executeBatchOnChain(payments: QuickPayRequest[]) {
    if (payments.length === 0) return;

    if (!this.sessionManagerContract) {
      // Mock模式：模拟执行成功，更新payment状态
      this.logger.warn(`Mock mode: Simulating batch execution for ${payments.length} payments`);
      for (const payment of payments) {
        const paymentRecord = await this.paymentRepository.findOne({
          where: { id: payment.paymentId },
        });
        if (paymentRecord && paymentRecord.status === PaymentStatus.PROCESSING) {
          // 在Mock模式下，标记为完成（模拟链上执行成功）
          paymentRecord.status = PaymentStatus.COMPLETED;
          paymentRecord.transactionHash = `mock_${payment.paymentId}_${Date.now()}`;
          paymentRecord.metadata = {
            ...paymentRecord.metadata,
            mockMode: true,
            mockExecutedAt: new Date().toISOString(),
          };
          await this.paymentRepository.save(paymentRecord);
          this.logger.log(`Mock mode: Payment ${payment.paymentId} marked as completed`);
        }
      }
      return;
    }

    this.logger.log(`Executing batch on-chain: ${payments.length} payments`);

    try {
      // 修复零地址：为每个支付请求检查并修复to地址，使用 Commission 合约地址
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const commissionAddress = this.configService.get<string>('COMMISSION_CONTRACT_ADDRESS');
      
      if (!commissionAddress) {
        this.logger.error('❌ COMMISSION_CONTRACT_ADDRESS 未配置，无法修复零地址');
        throw new BadRequestException('Commission合约地址未配置，请联系管理员');
      }
      
      for (const payment of payments) {
        if (payment.to.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
          payment.to = commissionAddress;
          this.logger.log(`✅ 批量处理：已修复支付 ${payment.paymentId} 的收款地址为 Commission 合约: ${payment.to}`);
        }
      }

      // 准备批量执行参数
      const sessionIds = payments.map((p) => p.sessionId);
      const recipients = payments.map((p) => p.to);
      
      // 合约期望的金额是 6 decimals（USDC），需要将实际 token 金额转换为 6 decimals
      const contractDecimals = 6; // 合约期望 6 decimals
      const amounts = payments.map((p) => {
        const tokenDecimals = p.tokenDecimals || 6; // 默认 6 decimals (USDC)
        let amountForContract: bigint;
        if (tokenDecimals > contractDecimals) {
          // 从高精度转换为低精度（例如：18 -> 6，除以 10^12）
          const diff = tokenDecimals - contractDecimals;
          let scaleFactor = BigInt(1);
          for (let i = 0; i < diff; i++) {
            scaleFactor = scaleFactor * BigInt(10);
          }
          amountForContract = BigInt(p.amount) / scaleFactor;
        } else if (tokenDecimals < contractDecimals) {
          // 从低精度转换为高精度（例如：6 -> 18，乘以 10^12）
          const diff = contractDecimals - tokenDecimals;
          let scaleFactor = BigInt(1);
          for (let i = 0; i < diff; i++) {
            scaleFactor = scaleFactor * BigInt(10);
          }
          amountForContract = BigInt(p.amount) * scaleFactor;
        } else {
          // 精度相同，直接使用
          amountForContract = BigInt(p.amount);
        }
        return amountForContract;
      });
      
      const paymentIds = payments.map((p) => {
        // 使用 orderId 进行链上执行（如果提供），否则使用 paymentId
        const idForExecution = p.orderId || p.paymentId;
        // 将 ID 字符串转换为 bytes32
        if (idForExecution.startsWith('0x') && idForExecution.length === 66) {
          return zeroPadValue(idForExecution, 32);
        } else {
          // 将字符串哈希为 bytes32
          return keccak256(toUtf8Bytes(idForExecution));
        }
      });
      const signatures = payments.map((p) => p.signature);

      // 调用合约批量执行
      const tx = await this.sessionManagerContract.executeBatchWithSession(
        sessionIds,
        recipients,
        amounts,
        paymentIds,
        signatures,
        {
          gasLimit: 500000 * payments.length, // 估算 Gas
        },
      );

      const receipt = await tx.wait();
      this.logger.log(
        `Batch execution confirmed: txHash=${receipt.transactionHash}, gasUsed=${receipt.gasUsed}`,
      );

      // 更新支付记录的 transactionHash
      for (const payment of payments) {
        const paymentRecord = await this.paymentRepository.findOne({
          where: { id: payment.paymentId },
        });
        if (paymentRecord) {
          paymentRecord.transactionHash = receipt.transactionHash;
          await this.paymentRepository.save(paymentRecord);
        }
      }
    } catch (error) {
      this.logger.error(`On-chain execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取队列状态（用于监控）
   */
  getQueueStatus() {
    return {
      queueLength: this.paymentQueue.length,
      oldestPayment: this.paymentQueue.length > 0
        ? new Date(this.paymentQueue[0].timestamp)
        : null,
      isProcessing: this.isProcessingBatch,
    };
  }
}

