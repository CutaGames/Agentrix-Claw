import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  JsonRpcProvider,
  Contract,
  keccak256,
  AbiCoder,
  formatUnits,
  ZeroAddress,
} from 'ethers';
import { AgentSession, SessionStatus } from '../../entities/agent-session.entity';
import { WalletConnection } from '../../entities/wallet-connection.entity';
import { CreateSessionDto } from './dto/session.dto';

// ERC8004SessionManager ABI (简化版)
const ERC8004_ABI = [
  'function createSession(address, uint256, uint256, uint256) returns (bytes32)',
  'function revokeSession(bytes32)',
  'function getSession(bytes32) view returns (tuple(address signer, address owner, uint256 singleLimit, uint256 dailyLimit, uint256 usedToday, uint256 expiry, uint256 lastResetDate, bool isActive))',
];

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private provider: JsonRpcProvider;
  private sessionManagerContract: Contract | null = null;

  constructor(
    @InjectRepository(AgentSession)
    private sessionRepository: Repository<AgentSession>,
    @InjectRepository(WalletConnection)
    private walletRepository: Repository<WalletConnection>,
    private configService: ConfigService,
  ) {
    this.initializeContracts();
  }

  /**
   * 初始化合约连接
   */
  private initializeContracts() {
    try {
      // 优先使用 BSC_TESTNET_RPC_URL，如果没有则使用 RPC_URL，最后使用默认值
      const rpcUrl = this.configService.get<string>('BSC_TESTNET_RPC_URL') 
        || this.configService.get<string>('RPC_URL') 
        || 'http://localhost:8545';
      this.provider = new JsonRpcProvider(rpcUrl);

      const contractAddress = this.configService.get<string>('ERC8004_CONTRACT_ADDRESS');
      if (contractAddress) {
        this.sessionManagerContract = new Contract(
          contractAddress,
          ERC8004_ABI,
          this.provider,
        );
      }
    } catch (error: any) {
      this.logger.warn(`Failed to initialize contracts: ${error.message}`);
    }
  }

  /**
   * 创建 Session（链上 + 链下）
   */
  async createSession(userId: string, dto: CreateSessionDto) {
    try {
      // 1. 获取用户钱包地址
      const wallet = await this.walletRepository.findOne({
        where: { userId, isDefault: true },
      });

      if (!wallet) {
        throw new BadRequestException('User wallet not found');
      }

      // 2. 验证签名（确保用户授权）
      // 这里应该验证 dto.signature 是否来自用户钱包
      // 简化实现，实际应该验证签名

      // 3. 计算过期时间戳
      const expiryTimestamp = Math.floor(Date.now() / 1000) + dto.expiryDays * 86400;

      // 4. 根据链上Session数据校验/填充
      let sessionId = dto.sessionId;
      let normalizedSingleLimit = dto.singleLimit / 1e6;
      let normalizedDailyLimit = Math.max(dto.dailyLimit / 1e6, normalizedSingleLimit);
      let expiryDate = new Date(expiryTimestamp * 1000);

      if (sessionId && this.sessionManagerContract) {
        const onChainSession = await this.sessionManagerContract.getSession(sessionId);

        if (!onChainSession || onChainSession.signer === ZeroAddress) {
          throw new BadRequestException('Session not found on-chain');
        }

        if (
          onChainSession.owner?.toLowerCase() !== wallet.walletAddress.toLowerCase()
        ) {
          throw new BadRequestException('Session owner mismatch');
        }

        if (onChainSession.signer?.toLowerCase() !== dto.signer.toLowerCase()) {
          throw new BadRequestException('Session signer mismatch');
        }

        normalizedSingleLimit = Number(formatUnits(onChainSession.singleLimit, 6));
        normalizedDailyLimit = Number(formatUnits(onChainSession.dailyLimit, 6));
        expiryDate = new Date(Number(onChainSession.expiry) * 1000);
      } else if (!sessionId) {
        // 没有链上Session（开发模式）：生成 sessionId
        const abiCoder = AbiCoder.defaultAbiCoder();
        sessionId = keccak256(
          abiCoder.encode(
            ['address', 'address', 'uint256'],
            [wallet.walletAddress, dto.signer, Date.now()],
          ),
        );
      }

      // 5. 保存到数据库
      const session = this.sessionRepository.create({
        sessionId,
        userId,
        agentId: dto.agentId || null,
        signerAddress: dto.signer,
        ownerAddress: wallet.walletAddress,
        singleLimit: normalizedSingleLimit,
        dailyLimit: normalizedDailyLimit,
        usedToday: 0,
        expiry: expiryDate,
        status: SessionStatus.ACTIVE,
        // 原有字段设为默认值
        context: null,
        lastMessageAt: null,
      });

      const savedSession = await this.sessionRepository.save(session);

      this.logger.log(`Session created: ${sessionId} for user ${userId}`);

      return {
        sessionId: savedSession.sessionId!,
        signer: savedSession.signerAddress!,
        singleLimit: (savedSession.singleLimit || 0).toString(),
        dailyLimit: (savedSession.dailyLimit || 0).toString(),
        expiry: savedSession.expiry!,
        createdAt: savedSession.createdAt,
      };
    } catch (error) {
      this.logger.error(`Failed to create session: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取用户的所有 Session
   */
  async getUserSessions(userId: string) {
    const sessions = await this.sessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return sessions
      .filter(
        (session) =>
          session.sessionId && session.status === SessionStatus.ACTIVE,
      ) // 只返回仍然有效的支付 Session
      .map((session) => ({
        id: session.id,
        sessionId: session.sessionId!,
        signer: session.signerAddress!,
        singleLimit: session.singleLimit || 0,
        dailyLimit: session.dailyLimit || 0,
        usedToday: session.usedToday || 0,
        expiry: session.expiry!,
        isActive: session.status === SessionStatus.ACTIVE,
        agentId: session.agentId,
        createdAt: session.createdAt,
      }));
  }

  /**
   * 获取活跃的 Session
   */
  async getActiveSession(userId: string) {
    const session = await this.sessionRepository.findOne({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });

    if (!session || !session.sessionId) {
      return null; // 只返回支付 Session
    }

    // 检查是否过期
    if (session.expiry && new Date() > session.expiry) {
      session.status = SessionStatus.EXPIRED;
      await this.sessionRepository.save(session);
      return null;
    }

    return {
      id: session.id,
      sessionId: session.sessionId!,
      signer: session.signerAddress!,
      singleLimit: session.singleLimit || 0,
      dailyLimit: session.dailyLimit || 0,
      usedToday: session.usedToday || 0,
      expiry: session.expiry!,
      isActive: true,
      agentId: session.agentId || undefined,
    };
  }

  /**
   * 撤销 Session
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({
      where: { sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session already revoked or expired');
    }

    // 调用合约撤销（如果合约可用）
    if (this.sessionManagerContract) {
      try {
        // 这里需要用户钱包签名，实际应该通过前端调用
        // 简化实现：只更新数据库状态
        this.logger.warn('On-chain revocation requires user wallet signature');
      } catch (error) {
        this.logger.warn(`Failed to revoke session on-chain: ${error.message}`);
      }
    }

    // 更新数据库状态
    session.status = SessionStatus.REVOKED;
    await this.sessionRepository.save(session);

    this.logger.log(`Session revoked: ${sessionId} by user ${userId}`);

    return {
      success: true,
      sessionId,
    };
  }
}

