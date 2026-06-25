import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token, TokenStatus, TokenChain } from '../../entities/token.entity';
import { ProductService } from '../product/product.service';
import { ContractDeploymentService } from '../contract/contract-deployment.service';
import { MetadataStorageService } from '../metadata/metadata-storage.service';

export interface TokenLaunchRequest {
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  chain: TokenChain;
  distribution?: {
    team: number;
    investors: number;
    public: number;
    reserve: number;
  };
  lockup?: {
    team?: {
      amount: number;
      releaseSchedule: Array<{
        date: string;
        amount: number;
      }>;
    };
    investors?: {
      amount: number;
      releaseSchedule: Array<{
        date: string;
        amount: number;
      }>;
    };
  };
  presale?: {
    price: number;
    amount: number;
    startDate: string;
    endDate: string;
    whitelist?: string[];
    minPurchase?: number;
    maxPurchase?: number;
  };
  publicSale?: {
    price: number;
    startDate: string;
  };
}

export interface TokenLaunchResponse {
  tokenId: string;
  contractAddress: string;
  transactionHash: string;
  productId: string;
  status: TokenStatus;
  presaleContractAddress?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
    private productService: ProductService,
    private contractDeploymentService: ContractDeploymentService,
    private metadataStorageService: MetadataStorageService,
  ) {}

  /**
   * 发行代币
   */
  async launch(userId: string, request: TokenLaunchRequest): Promise<TokenLaunchResponse> {
    // 验证输入
    this.validateLaunchRequest(request);

    // 创建代币记录
    const token = this.tokenRepository.create({
      name: request.name,
      symbol: request.symbol,
      totalSupply: request.totalSupply,
      decimals: request.decimals,
      chain: request.chain,
      status: TokenStatus.DRAFT,
      userId,
      distribution: request.distribution,
      lockup: request.lockup,
      presale: request.presale,
      publicSale: request.publicSale,
      stats: {
        totalSupply: request.totalSupply,
        sold: '0',
        remaining: request.totalSupply,
        totalRaised: '0',
        holders: 0,
      },
    });

    const savedToken = await this.tokenRepository.save(token);

    // 创建对应的 Product 记录（用于 Marketplace）
    let productId: string;
    try {
      const price = request.publicSale?.price || request.presale?.price || 0;
      const product = await this.productService.createProduct(userId, {
        name: `${request.name} (${request.symbol})`,
        description: `代币 ${request.symbol} - ${request.name}`,
        price: {
          amount: price,
          currency: 'USDC',
        },
        inventory: {
          type: 'digital',
          quantity: parseFloat(request.totalSupply),
        },
        category: 'token',
        productType: 'ft' as any,
        commissionRate: 0, // 代币发行默认不分润
        metadata: {
          core: {
            media: {
              images: [],
            },
          },
          extensions: {
            tokenId: savedToken.id,
            symbol: request.symbol,
            chain: request.chain,
            type: 'token',
            currency: 'USDC',
          },
        },
      });
      
      productId = product.id;
      savedToken.productId = productId;
      await this.tokenRepository.save(savedToken);
    } catch (error) {
      this.logger.error('创建 Product 失败:', error);
      // 继续执行，不阻塞代币发行
    }

    // 异步部署智能合约
    this.deployTokenContract(savedToken.id, request).catch((error) => {
      this.logger.error(`代币 ${savedToken.id} 合约部署失败:`, error);
      this.tokenRepository.update(savedToken.id, {
        status: TokenStatus.FAILED,
        metadata: { error: error.message },
      });
    });

    return {
      tokenId: savedToken.id,
      contractAddress: '', // 部署中
      transactionHash: '', // 部署中
      productId: productId || '',
      status: TokenStatus.DEPLOYING,
    };
  }

  /**
   * 部署代币合约
   */
  private async deployTokenContract(tokenId: string, request: TokenLaunchRequest): Promise<void> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token) {
      throw new NotFoundException('代币不存在');
    }

    try {
      // 更新状态为部署中
      await this.tokenRepository.update(tokenId, {
        status: TokenStatus.DEPLOYING,
      });

      // 调用合约部署服务
      const deploymentResult = await this.contractDeploymentService.deployTokenContract({
        name: request.name,
        symbol: request.symbol,
        totalSupply: request.totalSupply,
        decimals: request.decimals,
        chain: request.chain,
        distribution: request.distribution,
        lockup: request.lockup,
        presale: request.presale,
        publicSale: request.publicSale,
      });

      // 更新代币记录
      await this.tokenRepository.update(tokenId, {
        status: TokenStatus.DEPLOYED,
        contractAddress: deploymentResult.contractAddress,
        transactionHash: deploymentResult.transactionHash,
        presale: request.presale
          ? {
              ...request.presale,
              contractAddress: deploymentResult.presaleContractAddress,
            }
          : undefined,
      });

      this.logger.log(`代币 ${tokenId} 合约部署成功: ${deploymentResult.contractAddress}`);
    } catch (error) {
      this.logger.error(`代币 ${tokenId} 合约部署失败:`, error);
      await this.tokenRepository.update(tokenId, {
        status: TokenStatus.FAILED,
        metadata: { error: error.message },
      });
      throw error;
    }
  }

  /**
   * 查询代币状态
   */
  async getStatus(tokenId: string): Promise<{
    status: TokenStatus;
    contractAddress?: string;
    transactionHash?: string;
    deployedAt?: Date;
    error?: string;
    stats?: {
      totalSupply: string;
      sold: string;
      remaining: string;
      totalRaised: string;
    };
  }> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token) {
      throw new NotFoundException('代币不存在');
    }

    return {
      status: token.status,
      contractAddress: token.contractAddress,
      transactionHash: token.transactionHash,
      deployedAt: token.status === TokenStatus.DEPLOYED ? token.updatedAt : undefined,
      error: token.metadata?.error,
      stats: token.stats,
    };
  }

  /**
   * 购买代币
   */
  async buy(
    tokenId: string,
    userId: string,
    amount: number,
    paymentMethod: 'usdc' | 'usdt' | 'wallet',
    walletAddress?: string,
  ): Promise<{
    transactionHash: string;
    purchased: number;
    payment: number;
    tokenReceived: number;
  }> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token) {
      throw new NotFoundException('代币不存在');
    }

    if (token.status !== TokenStatus.DEPLOYED) {
      throw new BadRequestException('代币尚未部署完成');
    }

    if (!token.contractAddress) {
      throw new BadRequestException('代币合约地址不存在');
    }

    // 计算价格和数量
    const price = token.publicSale?.price || token.presale?.price || 0;
    const payment = amount * price;
    const tokenReceived = amount;

    // 这里应该调用支付服务处理支付
    // 然后调用合约服务执行代币转账
    // 暂时返回模拟结果
    const transactionHash = `0x${Math.random().toString(16).substring(2, 66)}`;

    // 更新统计数据
    const currentSold = parseFloat(token.stats?.sold || '0');
    const currentRaised = parseFloat(token.stats?.totalRaised || '0');
    await this.tokenRepository.update(tokenId, {
      stats: {
        ...token.stats,
        sold: (currentSold + tokenReceived).toString(),
        remaining: (parseFloat(token.totalSupply) - currentSold - tokenReceived).toString(),
        totalRaised: (currentRaised + payment).toString(),
        holders: (token.stats?.holders || 0) + 1,
      },
    });

    return {
      transactionHash,
      purchased: amount,
      payment,
      tokenReceived,
    };
  }

  /**
   * 查询代币销售信息
   */
  async getSaleInfo(tokenId: string): Promise<{
    price: number;
    available: number;
    sold: number;
    totalSupply: number;
    isActive: boolean;
    seller: string;
  }> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token) {
      throw new NotFoundException('代币不存在');
    }

    const price = token.publicSale?.price || token.presale?.price || 0;
    const sold = parseFloat(token.stats?.sold || '0');
    const totalSupply = parseFloat(token.totalSupply);
    const available = totalSupply - sold;

    return {
      price,
      available,
      sold,
      totalSupply,
      isActive: token.status === TokenStatus.DEPLOYED,
      seller: token.userId || '',
    };
  }

  /**
   * 更新代币价格
   */
  async updatePrice(tokenId: string, price: number): Promise<{ success: boolean; newPrice: number }> {
    const token = await this.tokenRepository.findOne({ where: { id: tokenId } });
    if (!token) {
      throw new NotFoundException('代币不存在');
    }

    if (token.publicSale) {
      token.publicSale.price = price;
    } else if (token.presale) {
      token.presale.price = price;
    } else {
      token.publicSale = {
        price,
        startDate: new Date().toISOString(),
      };
    }

    await this.tokenRepository.save(token);

    // 更新对应的 Product 价格
    if (token.productId && token.userId) {
      try {
        await this.productService.updateProduct(token.userId, token.productId, {
          price,
        });
      } catch (error) {
        this.logger.error('更新 Product 价格失败:', error);
      }
    }

    return {
      success: true,
      newPrice: price,
    };
  }

  /**
   * 验证发行请求
   */
  private validateLaunchRequest(request: TokenLaunchRequest): void {
    if (!request.name || request.name.trim().length === 0) {
      throw new BadRequestException('代币名称不能为空');
    }

    if (!request.symbol || request.symbol.trim().length === 0) {
      throw new BadRequestException('代币符号不能为空');
    }

    if (request.symbol.length > 10) {
      throw new BadRequestException('代币符号不能超过10个字符');
    }

    if (!request.totalSupply || parseFloat(request.totalSupply) <= 0) {
      throw new BadRequestException('总供应量必须大于0');
    }

    if (request.decimals < 0 || request.decimals > 18) {
      throw new BadRequestException('小数位数必须在0-18之间');
    }

    if (request.distribution) {
      const total =
        (request.distribution.team || 0) +
        (request.distribution.investors || 0) +
        (request.distribution.public || 0) +
        (request.distribution.reserve || 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new BadRequestException('代币分配比例总和必须等于100%');
      }
    }

    if (request.presale) {
      if (request.presale.price <= 0) {
        throw new BadRequestException('预售价格必须大于0');
      }
      if (request.presale.amount <= 0) {
        throw new BadRequestException('预售数量必须大于0');
      }
      if (new Date(request.presale.startDate) >= new Date(request.presale.endDate)) {
        throw new BadRequestException('预售结束日期必须晚于开始日期');
      }
    }
  }
}

