import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceAsset, MarketplaceAssetType } from '../../../entities/marketplace-asset.entity';

export interface SwapRequest {
  fromAssetId: string;
  toAssetId: string;
  amount: string;
  slippage?: number;
  userWallet?: string;
}

export interface SwapResponse {
  status: 'pending' | 'completed' | 'failed';
  transactionHash?: string;
  amountOut?: string;
  route?: any;
  error?: string;
}

@Injectable()
export class AssetTradingService {
  private readonly logger = new Logger(AssetTradingService.name);

  constructor(
    @InjectRepository(MarketplaceAsset)
    private readonly marketplaceAssetRepository: Repository<MarketplaceAsset>,
  ) {}

  /**
   * 执行代币交换
   * 支持：Jupiter (Solana), Uniswap (Ethereum)
   */
  async executeSwap(userId: string, request: SwapRequest): Promise<SwapResponse> {
    this.logger.log(`执行代币交换: ${request.fromAssetId} -> ${request.toAssetId}`);

    try {
      // 获取资产信息（使用 id 或 externalId 查找）
      const fromAsset = await this.marketplaceAssetRepository.findOne({
        where: [
          { id: request.fromAssetId },
          { externalId: request.fromAssetId },
          { address: request.fromAssetId },
        ],
      });
      const toAsset = await this.marketplaceAssetRepository.findOne({
        where: [
          { id: request.toAssetId },
          { externalId: request.toAssetId },
          { address: request.toAssetId },
        ],
      });

      if (!fromAsset || !toAsset) {
        return {
          status: 'failed',
          error: '资产不存在',
        };
      }

      // 根据链选择 DEX
      if (fromAsset.chain === 'solana') {
        return await this.executeJupiterSwap(fromAsset, toAsset, request);
      } else if (['ethereum', 'bsc', 'polygon'].includes(fromAsset.chain)) {
        return await this.executeUniswapSwap(fromAsset, toAsset, request);
      }

      return {
        status: 'failed',
        error: '不支持的链',
      };
    } catch (error: any) {
      this.logger.error(`执行交换失败: ${error.message}`, error.stack);
      return {
        status: 'failed',
        error: error.message || '交换失败',
      };
    }
  }

  /**
   * Jupiter Swap (Solana)
   */
  private async executeJupiterSwap(
    fromAsset: MarketplaceAsset,
    toAsset: MarketplaceAsset,
    request: SwapRequest,
  ): Promise<SwapResponse> {
    try {
      // 1. 获取报价
      const quoteResponse = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${fromAsset.address}&outputMint=${toAsset.address}&amount=${request.amount}&slippageBps=${(request.slippage || 1) * 100}`,
      );
      const quote = await quoteResponse.json();

      if (!quote.outAmount) {
        return {
          status: 'failed',
          error: '无法获取报价',
        };
      }

      // 2. 执行交换（需要用户签名，这里返回路由信息）
      return {
        status: 'pending',
        amountOut: quote.outAmount,
        route: {
          provider: 'jupiter',
          inputMint: fromAsset.address,
          outputMint: toAsset.address,
          inAmount: request.amount,
          outAmount: quote.outAmount,
          priceImpact: quote.priceImpactPct,
          routePlan: quote.routePlan,
        },
      };
    } catch (error: any) {
      this.logger.error(`Jupiter Swap 失败: ${error.message}`);
      return {
        status: 'failed',
        error: error.message || 'Jupiter Swap 失败',
      };
    }
  }

  /**
   * Uniswap Swap (Ethereum/BSC/Polygon)
   */
  private async executeUniswapSwap(
    fromAsset: MarketplaceAsset,
    toAsset: MarketplaceAsset,
    request: SwapRequest,
  ): Promise<SwapResponse> {
    try {
      // 使用 1inch API 获取报价
      const chainIdMap: Record<string, number> = {
        ethereum: 1,
        bsc: 56,
        polygon: 137,
      };
      const chainId = chainIdMap[fromAsset.chain] || 1;

      const quoteResponse = await fetch(
        `https://api.1inch.dev/swap/v6.0/${chainId}/quote?src=${fromAsset.address}&dst=${toAsset.address}&amount=${request.amount}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.ONEINCH_API_KEY || ''}`,
          },
        },
      );

      if (!quoteResponse.ok) {
        return {
          status: 'failed',
          error: '无法获取报价',
        };
      }

      const quote = await quoteResponse.json();

      return {
        status: 'pending',
        amountOut: quote.toAmount,
        route: {
          provider: '1inch',
          fromToken: fromAsset.address,
          toToken: toAsset.address,
          amount: request.amount,
          estimatedAmount: quote.toAmount,
          tx: quote.tx,
        },
      };
    } catch (error: any) {
      this.logger.error(`Uniswap Swap 失败: ${error.message}`);
      return {
        status: 'failed',
        error: error.message || 'Uniswap Swap 失败',
      };
    }
  }

  /**
   * 购买 NFT
   */
  async executeNFTPurchase(
    userId: string,
    nftId: string,
    price: string,
  ): Promise<SwapResponse> {
    this.logger.log(`购买 NFT: ${nftId}`);

    try {
      const nft = await this.marketplaceAssetRepository.findOne({
        where: [
          { id: nftId, type: MarketplaceAssetType.NFT },
          { externalId: nftId, type: MarketplaceAssetType.NFT },
          { address: nftId, type: MarketplaceAssetType.NFT },
        ],
      });

      if (!nft) {
        return {
          status: 'failed',
          error: 'NFT 不存在',
        };
      }

      // TODO: 实现 NFT 购买逻辑
      // 1. 检查 NFT 是否可购买
      // 2. 调用 NFT 市场 API 购买
      // 3. 记录交易

      return {
        status: 'pending',
        route: {
          provider: nft.source === 'magic_eden' ? 'magic_eden' : 'opensea',
          nftId,
          price,
        },
      };
    } catch (error: any) {
      this.logger.error(`购买 NFT 失败: ${error.message}`);
      return {
        status: 'failed',
        error: error.message || '购买失败',
      };
    }
  }
}

