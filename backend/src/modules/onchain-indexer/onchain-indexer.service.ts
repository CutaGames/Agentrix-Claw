import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';

export interface OnChainAssetMetadata {
  contract: string;
  tokenId?: string;
  chain: 'solana' | 'ethereum' | 'bsc' | 'polygon';
  name: string;
  description?: string;
  image?: string;
  attributes?: Array<{
    trait_type: string;
    value: any;
  }>;
  owner: string;
}

@Injectable()
export class OnChainIndexerService {
  private readonly logger = new Logger(OnChainIndexerService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  /**
   * 索引链上资产（V3.0：多链资产索引与统一SKU化）
   */
  async indexOnChainAsset(
    merchantId: string,
    asset: OnChainAssetMetadata,
    price: number,
    currency: string = 'USDT',
  ): Promise<Product> {
    try {
      // 检查是否已存在
      const existing = await this.productRepository.findOne({
        where: {
          merchantId,
          metadata: {
            contract: asset.contract,
            tokenId: asset.tokenId,
            chain: asset.chain,
          } as any,
        },
      });

      if (existing) {
        this.logger.log(`资产已存在: ${asset.contract}/${asset.tokenId}`);
        return existing;
      }

      // 创建商品
      const product = this.productRepository.create({
        merchantId,
        name: asset.name,
        description: asset.description || '',
        price,
        stock: 1, // NFT通常只有1个
        category: 'onchain',
        commissionRate: 0.05, // 链上资产默认5%分润
        status: 'active' as any,
        metadata: {
          assetType: asset.tokenId ? 'nft' : 'token',
          contract: asset.contract,
          tokenId: asset.tokenId,
          chain: asset.chain,
          owner: asset.owner,
          image: asset.image,
          attributes: asset.attributes,
          currency,
        },
      });

      const savedProduct = await this.productRepository.save(product);

      this.logger.log(`索引链上资产成功: productId=${savedProduct.id}, contract=${asset.contract}`);

      return savedProduct;
    } catch (error) {
      this.logger.error('索引链上资产失败:', error);
      throw error;
    }
  }

  /**
   * 批量索引链上资产
   */
  async batchIndexAssets(
    merchantId: string,
    assets: Array<{
      asset: OnChainAssetMetadata;
      price: number;
      currency?: string;
    }>,
  ): Promise<Product[]> {
    const results: Product[] = [];

    for (const item of assets) {
      try {
        const product = await this.indexOnChainAsset(
          merchantId,
          item.asset,
          item.price,
          item.currency,
        );
        results.push(product);
      } catch (error) {
        this.logger.error(`批量索引资产失败: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * 验证链上资产（V3.0：盗版/黑名单过滤）
   */
  async validateAsset(asset: OnChainAssetMetadata): Promise<{
    valid: boolean;
    reason?: string;
    blacklisted?: boolean;
  }> {
    // TODO: 实现黑名单检查
    // 这里可以调用外部API或数据库检查黑名单

    // 模拟验证逻辑
    const blacklist: string[] = []; // 从数据库或API获取黑名单

    if (blacklist.includes(asset.contract.toLowerCase())) {
      return {
        valid: false,
        reason: '合约地址在黑名单中',
        blacklisted: true,
      };
    }

    return { valid: true };
  }

  /**
   * 同步链上资产（从链上读取并索引）
   */
  async syncChainAssets(
    chain: 'solana' | 'ethereum' | 'bsc' | 'polygon',
    contract: string,
    merchantId: string,
  ): Promise<Product[]> {
    this.logger.log(`开始同步链上资产: chain=${chain}, contract=${contract}`);

    // TODO: 实现实际的链上资产读取
    // 这里需要根据不同的链调用相应的RPC节点
    // 例如：
    // - Ethereum: 使用 ethers.js 读取 ERC-721/ERC-1155
    // - Solana: 使用 @solana/web3.js 读取 Metaplex NFT
    // - BSC/Polygon: 类似 Ethereum

    // 模拟返回
    return [];
  }
}

