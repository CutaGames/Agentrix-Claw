import { Injectable } from '@nestjs/common';
import { Product, ProductType } from '../../../entities/product.entity';
import { IPlatformAdapter } from './platform-adapter.interface';
import { ClaudeToolSchema, AIPlatform, SystemCapability, FunctionSchema } from '../interfaces/capability.interface';

@Injectable()
export class ClaudeAdapter implements IPlatformAdapter {
  platform: AIPlatform = 'claude';

  convertProductToFunction(product: Product, capabilityType: string): ClaudeToolSchema {
    const toolName = this.getToolName(product, capabilityType);
    const description = this.generateDescription(product, capabilityType);
    const inputSchema = this.generateInputSchema(product, capabilityType);

    return {
      name: toolName,
      description,
      input_schema: {
        type: 'object',
        properties: inputSchema.properties,
        required: inputSchema.required,
      },
    };
  }

  convertProductsToFunctions(products: Product[], capabilityType: string): ClaudeToolSchema[] {
    return products.map((product) => this.convertProductToFunction(product, capabilityType));
  }

  validateSchema(schema: ClaudeToolSchema): boolean {
    return (
      !!schema.name &&
      !!schema.description &&
      schema.input_schema?.type === 'object' &&
      Array.isArray(schema.input_schema.required)
    );
  }

  private getToolName(product: Product, capabilityType: string): string {
    // Claude 工具名格式：paymind_{capability}_{type}
    const baseName = `paymind_${capabilityType}_${product.productType}`;
    return baseName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  }

  private generateDescription(product: Product, capabilityType: string): string {
    const productName = product.name;
    const productDesc = product.description || '';

    switch (capabilityType) {
      case 'purchase':
        return `购买商品：${productName}。${productDesc ? productDesc.substring(0, 100) : ''} 价格：${product.price} ${(product.metadata as any)?.currency || 'CNY'}`;
      case 'book':
        return `预约服务：${productName}。${productDesc ? productDesc.substring(0, 100) : ''}`;
      case 'mint':
        return `铸造链上资产：${productName}。${productDesc ? productDesc.substring(0, 100) : ''}`;
      case 'query':
        return `查询商品信息：${productName}。${productDesc ? productDesc.substring(0, 100) : ''}`;
      default:
        return `执行操作：${productName}。${productDesc ? productDesc.substring(0, 100) : ''}`;
    }
  }

  private generateInputSchema(product: Product, capabilityType: string): {
    properties: Record<string, any>;
    required: string[];
  } {
    const properties: Record<string, any> = {
      product_id: {
        type: 'string',
        description: `商品ID：${product.id}`,
      },
    };

    const required: string[] = ['product_id'];

    // 根据能力类型添加特定参数
    switch (capabilityType) {
      case 'purchase':
        properties.quantity = {
          type: 'number',
          description: '购买数量',
          minimum: 1,
        };
        properties.shipping_address = {
          type: 'string',
          description: '收货地址（实物商品需要）',
        };
        if (product.productType === ProductType.PHYSICAL) {
          required.push('shipping_address');
        }
        break;

      case 'book':
        properties.appointment_time = {
          type: 'string',
          description: '预约时间（ISO 8601格式）',
        };
        properties.contact_info = {
          type: 'string',
          description: '联系方式',
        };
        required.push('appointment_time', 'contact_info');
        break;

      case 'mint':
        properties.wallet_address = {
          type: 'string',
          description: '接收NFT的钱包地址',
        };
        properties.chain = {
          type: 'string',
          enum: ['ethereum', 'polygon', 'solana', 'bsc'],
          description: '区块链网络',
        };
        required.push('wallet_address', 'chain');
        break;
    }

    return { properties, required };
  }

  convertSystemCapabilityToFunction(capability: SystemCapability): ClaudeToolSchema {
    return {
      name: capability.name,
      description: capability.description,
      input_schema: {
        type: 'object',
        properties: capability.parameters.properties || {},
        required: capability.parameters.required || [],
      },
    };
  }
}


