import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { ProductService } from '../product/product.service';

export interface CartItem {
  productId: string;
  quantity: number;
  addedAt: Date;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  updatedAt: Date;
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @Inject(forwardRef(() => CacheService))
    private cacheService: CacheService,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
  ) {}

  /**
   * 获取用户购物车（支持未登录用户使用 sessionId）
   */
  async getCart(userIdOrSessionId: string, isSessionId: boolean = false): Promise<Cart> {
    const cacheKey = isSessionId ? `cart:session:${userIdOrSessionId}` : `cart:${userIdOrSessionId}`;
    const cached = await this.cacheService.get<Cart>(cacheKey);
    
    if (cached) {
      return cached;
    }

    // 返回空购物车
    return {
      userId: userIdOrSessionId,
      items: [],
      updatedAt: new Date(),
    };
  }

  /**
   * 添加商品到购物车（支持未登录用户使用 sessionId）
   */
  async addToCart(userIdOrSessionId: string, productId: string, quantity: number = 1, isSessionId: boolean = false): Promise<Cart> {
    const cart = await this.getCart(userIdOrSessionId, isSessionId);
    
    // 检查商品是否已在购物车中
    const existingItem = cart.items.find(item => item.productId === productId);
    
    if (existingItem) {
      // 更新数量
      existingItem.quantity += quantity;
    } else {
      // 添加新商品
      cart.items.push({
        productId,
        quantity,
        addedAt: new Date(),
      });
    }

    cart.updatedAt = new Date();
    await this.saveCart(cart, isSessionId);
    
    return cart;
  }

  /**
   * 从购物车移除商品（支持未登录用户使用 sessionId）
   */
  async removeFromCart(userIdOrSessionId: string, productId: string, isSessionId: boolean = false): Promise<Cart> {
    const cart = await this.getCart(userIdOrSessionId, isSessionId);
    cart.items = cart.items.filter(item => item.productId !== productId);
    cart.updatedAt = new Date();
    await this.saveCart(cart, isSessionId);
    
    return cart;
  }

  /**
   * 更新购物车商品数量（支持未登录用户使用 sessionId）
   */
  async updateCartItemQuantity(userIdOrSessionId: string, productId: string, quantity: number, isSessionId: boolean = false): Promise<Cart> {
    const cart = await this.getCart(userIdOrSessionId, isSessionId);
    const item = cart.items.find(item => item.productId === productId);
    
    if (item) {
      if (quantity <= 0) {
        // 数量为0或负数，移除商品
        return await this.removeFromCart(userIdOrSessionId, productId, isSessionId);
      }
      item.quantity = quantity;
    }
    
    cart.updatedAt = new Date();
    await this.saveCart(cart, isSessionId);
    
    return cart;
  }

  /**
   * 清空购物车（支持未登录用户使用 sessionId）
   */
  async clearCart(userIdOrSessionId: string, isSessionId: boolean = false): Promise<void> {
    const cacheKey = isSessionId ? `cart:session:${userIdOrSessionId}` : `cart:${userIdOrSessionId}`;
    await this.cacheService.delete(cacheKey);
  }

  /**
   * 保存购物车
   */
  private async saveCart(cart: Cart, isSessionId: boolean = false): Promise<void> {
    const cacheKey = isSessionId ? `cart:session:${cart.userId}` : `cart:${cart.userId}`;
    // 购物车缓存7天
    await this.cacheService.set(cacheKey, cart, 7 * 24 * 60 * 60);
  }

  /**
   * 获取购物车详情（包含商品信息，支持未登录用户使用 sessionId）
   */
  async getCartWithProducts(userIdOrSessionId: string, isSessionId: boolean = false): Promise<{
    items: Array<{
      productId: string;
      quantity: number;
      product: any;
    }>;
    total: number;
    itemCount: number;
  }> {
    const cart = await this.getCart(userIdOrSessionId, isSessionId);
    
    // 获取所有商品信息
    const itemsWithProducts = await Promise.all(
      cart.items.map(async (item) => {
        try {
          const product = await this.productService.getProduct(item.productId);
          return {
            productId: item.productId,
            quantity: item.quantity,
            product: product ? {
              id: product.id,
              name: product.name,
              description: product.description,
              price: Number(product.price),
              currency: (product.metadata as any)?.currency || 'CNY',
              stock: product.stock,
              category: product.category,
              merchantId: product.merchantId,
              image: (product.metadata as any)?.image,
              priceDisplay: `${(product.metadata as any)?.currency === 'CNY' ? '¥' : (product.metadata as any)?.currency === 'USD' ? '$' : ''}${Number(product.price).toFixed(2)} ${(product.metadata as any)?.currency || 'CNY'}`,
            } : null,
          };
        } catch (error) {
          this.logger.warn(`获取商品信息失败: ${item.productId}`, error);
          return {
            productId: item.productId,
            quantity: item.quantity,
            product: null,
          };
        }
      }),
    );

    // 过滤掉商品不存在的项
    const validItems = itemsWithProducts.filter(item => item.product !== null);

    // 计算总价
    const total = validItems.reduce((sum, item) => {
      return sum + (item.product?.price || 0) * item.quantity;
    }, 0);

    // 计算商品总数
    const itemCount = validItems.reduce((sum, item) => sum + item.quantity, 0);

    return {
      items: validItems,
      total,
      itemCount,
    };
  }
}

