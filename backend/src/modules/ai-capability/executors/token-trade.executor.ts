import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { TokenService } from '../../token/token.service';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';
import { LiquidityMeshService } from '../../liquidity/liquidity-mesh.service';
import { Token } from '../../../entities/token.entity';

/**
 * Token 交易能力执行器
 * 支持：购买 token、出售 token、交换 token
 */
@Injectable()
export class TokenTradeExecutor implements ICapabilityExecutor {
  readonly name = 'executor_token_trade';
  private readonly logger = new Logger(TokenTradeExecutor.name);

  constructor(
    private tokenService: TokenService,
    private productService: ProductService,
    private orderService: OrderService,
    private liquidityMeshService: LiquidityMeshService,
    @InjectRepository(Token)
    private tokenRepository: Repository<Token>,
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
          return await this.buyToken(params, userId);
        
        case 'sell':
          return await this.sellToken(params, userId);
        
        case 'swap':
        case 'exchange':
          return await this.swapToken(params, userId);
        
        case 'launch':
        case 'create':
          return await this.launchToken(params, userId);
        
        default:
          return {
            success: false,
            error: 'UNKNOWN_ACTION',
            message: `未知的 Token 操作: ${action}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`Token 交易执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: error.message || '执行失败',
      };
    }
  }

  /**
   * 购买 Token
   */
  private async buyToken(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    const { token_id, product_id, amount, currency = 'USDC' } = params;

    if (!token_id && !product_id) {
      return {
        success: false,
        error: 'MISSING_TOKEN_ID',
        message: '缺少 token_id 或 product_id',
      };
    }

    // 通过 product_id 或 token_id 获取商品信息
    let product;
    if (product_id) {
      product = await this.productService.getProduct(product_id);
    } else if (token_id) {
      // 通过 token_id 查找对应的 product
      const token = await this.tokenRepository.findOne({ where: { id: token_id } });
      if (token?.productId) {
        product = await this.productService.getProduct(token.productId);
      }
    }

    if (!product) {
      return {
        success: false,
        error: 'TOKEN_NOT_FOUND',
        message: 'Token 商品不存在',
      };
    }

    const purchaseAmount = amount || 1;
    const totalPrice = Number(product.price) * purchaseAmount;

    // 创建订单
    const order = await this.orderService.createOrder(userId, {
      merchantId: product.merchantId,
      productId: product.id,
      amount: totalPrice,
      currency,
      metadata: {
        tokenId: token_id,
        purchaseAmount,
        assetType: 'token',
        source: 'ai_capability',
      },
    });

    return {
      success: true,
      data: {
        orderId: order.id,
        tokenId: token_id,
        amount: purchaseAmount,
        totalPrice,
        currency,
        status: 'order_created',
      },
      message: `Token 购买订单已创建，订单号：${order.id}`,
      orderId: order.id,
    };
  }

  /**
   * 出售 Token
   */
  private async sellToken(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    // TODO: 实现 Token 出售逻辑
    return {
      success: false,
      error: 'NOT_IMPLEMENTED',
      message: 'Token 出售功能开发中',
    };
  }

  /**
   * 交换 Token（通过 DEX）
   */
  private async swapToken(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    const { from_token, to_token, amount, chain = 'bsc', slippage = 0.5 } = params;

    if (!from_token || !to_token || !amount) {
      return {
        success: false,
        error: 'MISSING_PARAMS',
        message: '缺少必要参数：from_token, to_token, amount',
      };
    }

    try {
      // 使用流动性网格服务执行交换
      const swapResult = await this.liquidityMeshService.executeSwap({
        fromToken: from_token,
        toToken: to_token,
        amount: amount.toString(),
        chain,
        walletAddress: userId, // 需要钱包地址，暂时使用 userId
        slippage: slippage,
      });

      return {
        success: true,
        data: swapResult,
        message: `Token 交换成功：${amount} ${from_token} -> ${swapResult.executedAmount || 'N/A'} ${to_token}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'SWAP_FAILED',
        message: `交换失败：${error.message}`,
      };
    }
  }

  /**
   * 发行 Token
   */
  private async launchToken(params: Record<string, any>, userId: string): Promise<ExecutionResult> {
    const {
      name,
      symbol,
      total_supply,
      decimals = 18,
      chain = 'bsc',
      distribution,
      presale,
      public_sale,
    } = params;

    if (!name || !symbol || !total_supply) {
      return {
        success: false,
        error: 'MISSING_PARAMS',
        message: '缺少必要参数：name, symbol, total_supply',
      };
    }

    try {
      const result = await this.tokenService.launch(userId, {
        name,
        symbol,
        totalSupply: total_supply.toString(),
        decimals,
        chain: chain as any,
        distribution,
        presale,
        publicSale: public_sale,
      });

      return {
        success: true,
        data: result,
        message: `Token ${symbol} 发行成功！合约地址：${result.contractAddress}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'LAUNCH_FAILED',
        message: `Token 发行失败：${error.message}`,
      };
    }
  }
}

