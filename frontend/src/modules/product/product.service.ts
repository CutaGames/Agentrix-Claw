import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { SearchService } from '../search/search.service';
import { CapabilityRegistryService } from '../ai-capability/services/capability-registry.service';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @Inject(forwardRef(() => SearchService))
    private searchService: SearchService,
    @Inject(forwardRef(() => CapabilityRegistryService))
    private capabilityRegistry: CapabilityRegistryService,
  ) {}

  async getProducts(search?: string) {
    const where: any = { status: 'active' };
    if (search) {
      where.name = Like(`%${search}%`);
    }
    return this.productRepository.find({ where });
  }

  async getProduct(id: string) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('商品不存在');
    }
    return product;
  }

  async createProduct(merchantId: string, dto: CreateProductDto) {
    // 处理统一数据标准格式，转换为数据库存储格式
    const productData: any = {
      merchantId,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      productType: dto.productType || 'physical',
    };

    // 处理价格信息（统一标准格式优先）
    if (dto.price && typeof dto.price === 'object' && 'amount' in dto.price) {
      productData.price = dto.price.amount;
      // 将货币信息存储到 metadata
      if (!productData.metadata) productData.metadata = {};
      productData.metadata.currency = dto.price.currency || 'CNY';
    } else if (dto.price_legacy !== undefined) {
      // 向后兼容旧格式
      productData.price = dto.price_legacy;
      if (!productData.metadata) productData.metadata = {};
      productData.metadata.currency = 'CNY';
    } else if (typeof dto.price === 'number') {
      // 直接数字格式
      productData.price = dto.price;
      if (!productData.metadata) productData.metadata = {};
      productData.metadata.currency = 'CNY';
    }

    // 处理库存信息（统一标准格式优先）
    if (dto.inventory && typeof dto.inventory === 'object') {
      if (dto.inventory.type === 'finite' && dto.inventory.quantity !== undefined) {
        productData.stock = dto.inventory.quantity;
      } else if (dto.inventory.type === 'unlimited' || dto.inventory.type === 'digital') {
        productData.stock = 999999; // 无限库存用大数字表示
      }
    } else if (dto.stock !== undefined) {
      // 向后兼容旧格式
      productData.stock = dto.stock;
    } else {
      productData.stock = 0;
    }

    // 处理分润率
    if (dto.commissionRate !== undefined) {
      productData.commissionRate = dto.commissionRate;
    }

    // 处理统一元数据
    if (dto.metadata) {
      productData.metadata = {
        ...productData.metadata,
        ...dto.metadata,
        // 确保 core.media 结构正确
        core: dto.metadata.core || {
          media: {
            images: [],
          },
        },
      };
    }

    // 处理标签和其他扩展字段
    if (dto.tags && dto.tags.length > 0) {
      if (!productData.metadata) productData.metadata = {};
      productData.metadata.tags = dto.tags;
    }

    const product = this.productRepository.create(productData);
    const savedProduct = (await this.productRepository.save(product)) as unknown as Product;

    // 自动索引到向量数据库
    try {
      const currency = (savedProduct.metadata as any)?.extensions?.currency || 
                      (savedProduct.metadata as any)?.currency || 
                      (savedProduct.metadata as any)?.core?.price?.currency || 
                      'CNY';
      await this.searchService.indexProduct(
        savedProduct.id,
        savedProduct.name,
        savedProduct.description || '',
        {
          merchantId: savedProduct.merchantId,
          price: savedProduct.price,
          currency,
          category: savedProduct.category,
          stock: savedProduct.stock,
        },
      );
    } catch (error) {
      // 索引失败不影响商品创建
      console.error('商品索引失败:', error);
    }

    // 自动注册 AI 能力（生成 Function Schema）
    // 不指定平台，自动注册所有已注册的平台
    try {
      await this.capabilityRegistry.register(savedProduct.id, undefined, {
        autoEnable: true,
      });
    } catch (error) {
      // 能力注册失败不影响商品创建
      console.error('AI能力注册失败:', error);
    }

    return savedProduct;
  }

  async updateProduct(merchantId: string, id: string, dto: UpdateProductDto) {
    const product = await this.productRepository.findOne({
      where: { id, merchantId },
    });

    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    Object.assign(product, dto);
    const updatedProduct = await this.productRepository.save(product);

    // 更新后重新索引到向量数据库
    try {
      await this.searchService.indexProduct(
        updatedProduct.id,
        updatedProduct.name,
        updatedProduct.description || '',
        {
          merchantId: updatedProduct.merchantId,
          price: updatedProduct.price,
          currency: (updatedProduct.metadata as any)?.currency || 'CNY',
          category: updatedProduct.category,
          stock: updatedProduct.stock,
        },
      );
    } catch (error) {
      // 索引失败不影响商品更新
      console.error('商品重新索引失败:', error);
    }

    // 更新后重新注册 AI 能力（重新生成 Function Schema）
    // 不指定平台，自动注册所有已注册的平台
    try {
      await this.capabilityRegistry.register(updatedProduct.id, undefined, {
        autoEnable: true,
        forceRegenerate: true,
      });
    } catch (error) {
      // 能力注册失败不影响商品更新
      console.error('AI能力重新注册失败:', error);
    }

    return updatedProduct;
  }

  async deleteProduct(merchantId: string, id: string) {
    const product = await this.productRepository.findOne({
      where: { id, merchantId },
    });

    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    await this.productRepository.remove(product);
    return { message: '商品已删除' };
  }
}

