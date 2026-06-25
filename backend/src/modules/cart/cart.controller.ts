import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: '获取用户购物车' })
  @ApiResponse({ status: 200, description: '返回购物车信息' })
  async getCart(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    return this.cartService.getCart(userId);
  }

  @Get('products')
  @ApiOperation({ summary: '获取购物车及商品详情' })
  @ApiResponse({ status: 200, description: '返回购物车及商品详情' })
  async getCartWithProducts(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    return this.cartService.getCartWithProducts(userId);
  }

  @Post('items')
  @ApiOperation({ summary: '添加商品到购物车' })
  @ApiResponse({ status: 200, description: '商品已添加到购物车' })
  async addItem(
    @Request() req: any,
    @Body() body: { productId: string; quantity: number },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    return this.cartService.addToCart(userId, body.productId, body.quantity || 1);
  }

  @Put('items/:productId')
  @ApiOperation({ summary: '更新购物车商品数量' })
  @ApiResponse({ status: 200, description: '商品数量已更新' })
  async updateItem(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() body: { quantity: number },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    return this.cartService.updateCartItemQuantity(userId, productId, body.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: '从购物车移除商品' })
  @ApiResponse({ status: 200, description: '商品已从购物车移除' })
  async removeItem(
    @Request() req: any,
    @Param('productId') productId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    return this.cartService.removeFromCart(userId, productId);
  }

  @Delete()
  @ApiOperation({ summary: '清空购物车' })
  @ApiResponse({ status: 200, description: '购物车已清空' })
  async clearCart(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    return this.cartService.clearCart(userId);
  }
}

