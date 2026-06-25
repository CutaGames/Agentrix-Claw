import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '../../entities/user.entity';

@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: '获取商品列表' })
  @ApiResponse({ status: 200, description: '返回商品列表' })
  @Public()
  async getProducts(
    @Query('search') search?: string,
    @Query('merchantId') merchantId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Request() req?: any,
  ) {
    // 如果用户已登录且是商户，且没有指定merchantId，默认使用当前用户的merchantId
    let finalMerchantId = merchantId;
    if (!finalMerchantId && req?.user?.roles?.includes(UserRole.MERCHANT)) {
      finalMerchantId = req.user.id;
    }
    
    return this.productService.getProducts(search, finalMerchantId, status, type);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取商品详情' })
  @ApiResponse({ status: 200, description: '返回商品详情' })
  @Public()
  async getProduct(@Param('id') id: string) {
    return this.productService.getProduct(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建商品（商户）' })
  @ApiResponse({ status: 201, description: '商品创建成功' })
  async createProduct(@Request() req, @Body() dto: CreateProductDto) {
    return this.productService.createProduct(req.user.id, dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新商品' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateProduct(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.updateProduct(req.user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除商品' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteProduct(@Request() req, @Param('id') id: string) {
    return this.productService.deleteProduct(req.user.id, id);
  }

  @Post('x402/auto-fetch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '自动获取X402商品' })
  @ApiResponse({ status: 200, description: '返回获取的X402商品' })
  async autoFetchX402Products(@Request() req) {
    return this.productService.autoFetchX402Products(req.user.id);
  }

  @Get('x402/available')
  @ApiOperation({ summary: '获取可用的X402商品列表' })
  @ApiResponse({ status: 200, description: '返回X402商品列表' })
  @Public()
  async getX402Products() {
    return this.productService.getX402Products();
  }
}

