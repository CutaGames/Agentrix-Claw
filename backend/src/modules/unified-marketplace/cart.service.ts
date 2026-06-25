/**
 * Cart Service
 * 
 * 购物车持久化服务，替代 unified-marketplace 中的内存 Map 存储
 */
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem } from '../../entities/cart.entity';
import { Skill } from '../../entities/skill.entity';

export interface AddToCartDto {
  skillId: string;
  quantity?: number;
}

export interface UpdateCartItemDto {
  skillId: string;
  quantity: number;
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
  ) {}

  /**
   * 获取用户购物车（不存在则创建）
   */
  async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({ where: { userId } });
    
    if (!cart) {
      cart = this.cartRepository.create({
        userId,
        items: [],
        totalAmount: 0,
        currency: 'USD',
      });
      cart = await this.cartRepository.save(cart);
      this.logger.log(`Created new cart for user ${userId}`);
    }
    
    return cart;
  }

  /**
   * 添加商品到购物车
   */
  async addToCart(userId: string, dto: AddToCartDto): Promise<Cart> {
    const skill = await this.skillRepository.findOne({ where: { id: dto.skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill not found: ${dto.skillId}`);
    }

    const cart = await this.getOrCreateCart(userId);
    const quantity = dto.quantity || 1;

    // 检查商品是否已在购物车中
    const existingItemIndex = cart.items.findIndex(item => item.skillId === dto.skillId);

    if (existingItemIndex >= 0) {
      // 更新数量
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      // 添加新商品
      const newItem: CartItem = {
        skillId: skill.id,
        skillName: skill.name,
        quantity,
        unitPrice: skill.pricing?.pricePerCall || 0,
        currency: skill.pricing?.currency || 'USD',
      };
      cart.items.push(newItem);
    }

    // 重新计算总价
    cart.totalAmount = cart.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const saved = await this.cartRepository.save(cart);
    this.logger.log(`Added skill ${dto.skillId} to cart of user ${userId}`);
    
    return saved;
  }

  /**
   * 更新购物车商品数量
   */
  async updateCartItem(userId: string, dto: UpdateCartItemDto): Promise<Cart> {
    const cart = await this.getOrCreateCart(userId);
    
    const itemIndex = cart.items.findIndex(item => item.skillId === dto.skillId);
    if (itemIndex === -1) {
      throw new NotFoundException(`Item not in cart: ${dto.skillId}`);
    }

    if (dto.quantity <= 0) {
      // 数量为0则删除
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = dto.quantity;
    }

    // 重新计算总价
    cart.totalAmount = cart.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    return await this.cartRepository.save(cart);
  }

  /**
   * 从购物车移除商品
   */
  async removeFromCart(userId: string, skillId: string): Promise<Cart> {
    const cart = await this.getOrCreateCart(userId);
    
    cart.items = cart.items.filter(item => item.skillId !== skillId);

    // 重新计算总价
    cart.totalAmount = cart.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const saved = await this.cartRepository.save(cart);
    this.logger.log(`Removed skill ${skillId} from cart of user ${userId}`);
    
    return saved;
  }

  /**
   * 清空购物车
   */
  async clearCart(userId: string): Promise<Cart> {
    const cart = await this.getOrCreateCart(userId);
    
    cart.items = [];
    cart.totalAmount = 0;

    const saved = await this.cartRepository.save(cart);
    this.logger.log(`Cleared cart for user ${userId}`);
    
    return saved;
  }

  /**
   * 获取购物车
   */
  async getCart(userId: string): Promise<Cart> {
    return await this.getOrCreateCart(userId);
  }
}
