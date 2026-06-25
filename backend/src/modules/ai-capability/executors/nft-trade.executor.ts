import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { NFTService } from '../../nft/nft.service';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';
import { NFT } from '../../../entities/nft.entity';

/**
 * NFT 交易能力执行器
 * 支持：购买 NFT、出售 NFT、铸造 NFT、创建 NFT 集合
 */
@Injectable()
export class NFTTradeExecutor implements ICapabilityExecutor {
  readonly name = 'executor_nft_trade';
  private readonly logger = new Logger(NFTTradeExecutor.name);

  constructor(
    private nftService: NFTService,
    private productService: ProductService,
    private orderService: OrderService,
    @InjectRepository(NFT)
    private nftRepository: Repository<NFT>,
  ) {}

  async execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const { userId } = context;
    
    if (!userId) {
      return {
        success: false,
        error: 'USER_NOT_AUTHENTICATED',
        message: '用户未认证，请先登录',
      };
    }

    const action = params.action || params.function_name?.split('_').pop();
    
    try {
      switch (action) {
        case 'buy':
        case 'purchase':
          return await this.buyNFT(params, userId);
        
        case 'sell':
          return await this.sellNFT(params, userId);
        
        case 'mint':
          return await this.mintNFT(params, userId);
        
        case 'create_collection':
          return await this.createCollection(params, userId);
        
        default:
          return {
            success: false,
            error: 'UNKNOWN_ACTION',
            message: `未知的 NFT 操作: ${action}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`NFT 交易执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: error.message || '执行失败',
      };
    }
  }

  /**
   * 购买 NFT
   */
  private async buyNFT(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    const { nft_id, product_id, wallet_address, chain = 'bsc' } = params;

    if (!nft_id && !product_id) {
      return {
        success: false,
        error: 'MISSING_NFT_ID',
        message: '缺少 nft_id 或 product_id',
      };
    }

    if (!wallet_address) {
      return {
        success: false,
        error: 'MISSING_WALLET_ADDRESS',
        message: '缺少接收 NFT 的钱包地址',
      };
    }

    // 获取 NFT 商品信息
    let product;
    if (product_id) {
      product = await this.productService.getProduct(product_id);
    } else if (nft_id) {
      const nft = await this.nftRepository.findOne({ where: { id: nft_id } });
      if (nft?.productId) {
        product = await this.productService.getProduct(nft.productId);
      }
    }

    if (!product) {
      return {
        success: false,
        error: 'NFT_NOT_FOUND',
        message: 'NFT 商品不存在',
      };
    }

    const totalPrice = Number(product.price);

    // 创建订单
    const order = await this.orderService.createOrder(userId, {
      merchantId: product.merchantId,
      productId: product.id,
      amount: totalPrice,
      currency: (product.metadata as any)?.extensions?.currency || 'USDC',
      metadata: {
        nftId: nft_id,
        walletAddress: wallet_address,
        chain: chain.toLowerCase(),
        assetType: 'nft',
        source: 'ai_capability',
      },
    });

    return {
      success: true,
      data: {
        orderId: order.id,
        nftId: nft_id,
        walletAddress: wallet_address,
        chain,
        totalPrice,
        status: 'order_created',
      },
      message: `NFT 购买订单已创建，订单号：${order.id}，将发送到 ${wallet_address}`,
      orderId: order.id,
    };
  }

  /**
   * 出售 NFT
   */
  private async sellNFT(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    // TODO: 实现 NFT 出售逻辑（上架到 Marketplace）
    return {
      success: false,
      error: 'NOT_IMPLEMENTED',
      message: 'NFT 出售功能开发中',
    };
  }

  /**
   * 铸造 NFT
   */
  private async mintNFT(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    const {
      collection_id,
      name,
      description,
      image,
      attributes,
      wallet_address,
      chain = 'bsc',
    } = params;

    if (!collection_id && !name) {
      return {
        success: false,
        error: 'MISSING_PARAMS',
        message: '缺少必要参数：collection_id 或 name',
      };
    }

    if (!wallet_address) {
      return {
        success: false,
        error: 'MISSING_WALLET_ADDRESS',
        message: '缺少接收 NFT 的钱包地址',
      };
    }

    try {
      // 如果提供了 collection_id，在现有集合中铸造
      if (collection_id) {
        const result = await this.nftService.mint(collection_id, userId, {
          items: [{
            name: name || 'Unnamed NFT',
            description,
            image: image || '',
            attributes: attributes || [],
          }],
          uploadTo: 'ipfs',
          autoList: false,
        });

        return {
          success: true,
          data: {
            nftId: result.nfts[0]?.tokenId,
            collectionId: collection_id,
            walletAddress: wallet_address,
            chain,
            transactionHash: result.nfts[0]?.transactionHash,
          },
          message: `NFT 铸造成功！NFT ID: ${result.nfts[0]?.tokenId}`,
        };
      } else {
        // 创建新集合并铸造
        // TODO: 实现创建集合并铸造的逻辑
        return {
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: '创建新集合并铸造功能开发中，请先提供 collection_id',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: 'MINT_FAILED',
        message: `NFT 铸造失败：${error.message}`,
      };
    }
  }

  /**
   * 创建 NFT 集合
   */
  private async createCollection(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    const {
      name,
      description,
      chain = 'bsc',
      standard = 'ERC721',
      royalty = 0,
      image,
    } = params;

    if (!name) {
      return {
        success: false,
        error: 'MISSING_NAME',
        message: '缺少集合名称',
      };
    }

    try {
      const result = await this.nftService.createCollection(userId, {
        name,
        description,
        chain: chain as any,
        standard: standard as any,
        royalty,
        image,
      });

      return {
        success: true,
        data: {
          collectionId: result.collectionId,
          contractAddress: result.contractAddress,
          chain,
          name,
        },
        message: `NFT 集合创建成功！集合 ID: ${result.collectionId}，合约地址：${result.contractAddress}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'CREATE_COLLECTION_FAILED',
        message: `创建 NFT 集合失败：${error.message}`,
      };
    }
  }
}

