import { Injectable, Logger, Inject, forwardRef, BadRequestException } from '@nestjs/common';
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

export interface CartValidationResult {
  valid: boolean;
  errors: Array<{
    productId: string;
    productName?: string;
    error: 'not_found' | 'insufficient_stock' | 'inactive' | 'price_changed';
    message: string;
    currentStock?: number;
    requestedQuantity?: number;
  }>;
  validItems: CartItem[];
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
    
    // 先尝试从缓存获取
    const cached = await this.cacheService.get<Cart>(cacheKey);
    
    if (cached) {
      this.logger.debug(`从缓存获取购物车: ${cacheKey}, 商品数量: ${cached.items?.length || 0}`);
      return cached;
    }

    // 如果缓存中没有，返回空购物车
    this.logger.debug(`缓存中没有购物车，返回空购物车: ${cacheKey}`);
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
    this.logger.debug(`保存购物车到缓存: ${cacheKey}, 商品数量: ${cart.items?.length || 0}`);
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

  /**
   * 验证购物车（库存、商品状态、价格）
   * 用于下单前校验
   */
  async validateCart(userIdOrSessionId: string, isSessionId: boolean = false): Promise<CartValidationResult> {
    const cart = await this.getCart(userIdOrSessionId, isSessionId);
    const errors: CartValidationResult['errors'] = [];
    const validItems: CartItem[] = [];

    for (const item of cart.items) {
      try {
        const product = await this.productService.getProduct(item.productId);
        
        // 检查商品状态
        if ((product as any).status !== 'active') {
          errors.push({
            productId: item.productId,
            productName: product.name,
            error: 'inactive',
            message: `商品 "${product.name}" 已下架`,
          });
          continue;
        }

        // 检查库存
        if (product.stock < item.quantity) {
          errors.push({
            productId: item.productId,
            productName: product.name,
            error: 'insufficient_stock',
            message: `商品 "${product.name}" 库存不足，当前库存: ${product.stock}，需要: ${item.quantity}`,
            currentStock: product.stock,
            requestedQuantity: item.quantity,
          });
          continue;
        }

        validItems.push(item);
      } catch (error) {
        errors.push({
          productId: item.productId,
          error: 'not_found',
          message: `商品不存在或已删除`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      validItems,
    };
  }

  /**
   * 添加商品到购物车（带库存校验）
   */
  async addToCartWithValidation(
    userIdOrSessionId: string, 
    productId: string, 
    quantity: number = 1, 
    isSessionId: boolean = false
  ): Promise<Cart> {
    // 先校验商品和库存
    try {
      const product = await this.productService.getProduct(productId);
      
      if ((product as any).status !== 'active') {
        throw new BadRequestException(`商品 "${product.name}" 已下架`);
      }

      // 获取当前购物车中该商品的数量
      const cart = await this.getCart(userIdOrSessionId, isSessionId);
      const existingItem = cart.items.find(item => item.productId === productId);
      const totalQuantity = (existingItem?.quantity || 0) + quantity;

      if (product.stock < totalQuantity) {
        throw new BadRequestException(
          `商品 "${product.name}" 库存不足，当前库存: ${product.stock}，购物车已有: ${existingItem?.quantity || 0}，无法再添加 ${quantity} 件`
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('商品不存在或已删除');
    }

    return this.addToCart(userIdOrSessionId, productId, quantity, isSessionId);
  }

  /**
   * 清理购物车中的无效商品（下架/删除/库存不足）
   */
  async cleanupInvalidItems(userIdOrSessionId: string, isSessionId: boolean = false): Promise<{
    removed: Array<{ productId: string; reason: string }>;
    adjusted: Array<{ productId: string; oldQuantity: number; newQuantity: number; reason: string }>;
  }> {
    const cart = await this.getCart(userIdOrSessionId, isSessionId);
    const removed: Array<{ productId: string; reason: string }> = [];
    const adjusted: Array<{ productId: string; oldQuantity: number; newQuantity: number; reason: string }> = [];
    const validItems: CartItem[] = [];

    for (const item of cart.items) {
      try {
        const product = await this.productService.getProduct(item.productId);
        
        // 商品下架
        if ((product as any).status !== 'active') {
          removed.push({ productId: item.productId, reason: '商品已下架' });
          continue;
        }

        // 库存不足，调整数量
        if (product.stock < item.quantity) {
          if (product.stock <= 0) {
            removed.push({ productId: item.productId, reason: '商品已售罄' });
            continue;
          }
          adjusted.push({
            productId: item.productId,
            oldQuantity: item.quantity,
            newQuantity: product.stock,
            reason: `库存不足，已调整为 ${product.stock}`,
          });
          validItems.push({ ...item, quantity: product.stock });
          continue;
        }

        validItems.push(item);
      } catch (error) {
        removed.push({ productId: item.productId, reason: '商品不存在' });
      }
    }

    // 更新购物车
    if (removed.length > 0 || adjusted.length > 0) {
      cart.items = validItems;
      cart.updatedAt = new Date();
      await this.saveCart(cart, isSessionId);
    }

    return { removed, adjusted };
  }
}
