import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';

@Injectable()
export class MintNFTExecutor implements ICapabilityExecutor {
  name = 'executor_mint';
  private readonly logger = new Logger(MintNFTExecutor.name);

  constructor(
    private productService: ProductService,
    private orderService: OrderService,
  ) {}

  async execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const { product_id, wallet_address, chain } = params;
      const { userId } = context;

      if (!userId) {
        return {
          success: false,
          error: 'USER_NOT_AUTHENTICATED',
          message: '用户未认证，请先登录',
        };
      }

      if (!product_id) {
        return {
          success: false,
          error: 'MISSING_PRODUCT_ID',
          message: '缺少资产ID参数',
        };
      }

      if (!wallet_address) {
        return {
          success: false,
          error: 'MISSING_WALLET_ADDRESS',
          message: '缺少钱包地址参数',
        };
      }

      if (!chain) {
        return {
          success: false,
          error: 'MISSING_CHAIN',
          message: '缺少区块链网络参数',
        };
      }

      // 1. 获取资产信息
      const product = await this.productService.getProduct(product_id);
      if (!product) {
        return {
          success: false,
          error: 'ASSET_NOT_FOUND',
          message: `链上资产不存在：${product_id}`,
        };
      }

      // 2. 验证链类型
      const supportedChains = ['ethereum', 'polygon', 'solana', 'bsc'];
      if (!supportedChains.includes(chain.toLowerCase())) {
        return {
          success: false,
          error: 'UNSUPPORTED_CHAIN',
          message: `不支持的区块链网络：${chain}，支持的链：${supportedChains.join(', ')}`,
        };
      }

      // 3. 计算价格
      const totalAmount = Number(product.price);
      const currency = (product.metadata as any)?.currency || 'CNY';

      // 4. 创建订单（链上资产订单）
      const order = await this.orderService.createOrder(userId, {
        merchantId: product.merchantId,
        productId: product.id,
        amount: totalAmount,
        currency,
        metadata: {
          walletAddress: wallet_address,
          chain: chain.toLowerCase(),
          assetType: product.productType,
          productSnapshot: {
            name: product.name,
            price: product.price,
            category: product.category,
          },
          source: 'ai_capability',
        },
      });

      // TODO: 实际调用链上合约进行 mint
      // 这里只是创建订单，实际的 mint 操作需要后续实现

      return {
        success: true,
        data: {
          orderId: order.id,
          assetName: product.name,
          walletAddress: wallet_address,
          chain: chain.toLowerCase(),
          totalAmount,
          currency,
          status: 'order_created',
        },
        message: `链上资产订单创建成功！订单号：${order.id}，将在 ${chain} 网络上铸造到 ${wallet_address}`,
        orderId: order.id,
      };
    } catch (error: any) {
      this.logger.error(`MintNFT execution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: `执行失败：${error.message}`,
      };
    }
  }
}


