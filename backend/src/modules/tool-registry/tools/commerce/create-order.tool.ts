import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProductType } from '../../../../entities/product.entity';
import { AssetType } from '../../../../entities/order.entity';
import { ProductService } from '../../../product/product.service';
import { OrderService } from '../../../order/order.service';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../interfaces';
import { RegisterTool } from '../../decorators/register-tool.decorator';

const inputSchema = z.object({
  productId: z.string().optional().describe('Product or resource ID to order'),
  productName: z.string().optional().describe('Product name to resolve if productId is not provided'),
  quantity: z.number().int().min(1).max(100).default(1).describe('Quantity to order'),
  shippingAddress: z.string().optional().describe('Optional shipping address for physical goods'),
});

type Input = z.infer<typeof inputSchema>;

function normalizeCurrency(metadata: Record<string, any> | null | undefined): string {
  return metadata?.currency
    || metadata?.extensions?.currency
    || metadata?.core?.price?.currency
    || 'CNY';
}

function mapAssetType(productType: ProductType | string | undefined): AssetType {
  switch (productType) {
    case ProductType.SERVICE:
      return AssetType.SERVICE;
    case ProductType.NFT:
    case ProductType.FT:
    case ProductType.GAME_ASSET:
    case ProductType.RWA:
    case ProductType.X402_SKILL:
    case ProductType.X402_METERED:
      return AssetType.VIRTUAL;
    default:
      return AssetType.PHYSICAL;
  }
}

@RegisterTool()
@Injectable()
export class CreateOrderTool implements AgentrixTool<Input> {
  readonly name = 'create_order';
  readonly category = ToolCategory.COMMERCE;
  readonly description = 'Create a marketplace order for a product, service, or resource.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = true;
  readonly riskLevel = 2 as const;
  readonly maxResultChars = 4000;

  constructor(
    private readonly productService: ProductService,
    private readonly orderService: OrderService,
  ) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.userId) {
      return { success: false, error: 'Please login before creating an order.' };
    }

    let productId = input.productId;
    if (!productId && input.productName) {
      const matches = await this.productService.getProducts(input.productName);
      productId = matches[0]?.id;
    }

    if (!productId) {
      return {
        success: false,
        error: 'Provide productId or productName to create an order.',
      };
    }

    const product = await this.productService.getProduct(productId);
    if (product.stock < input.quantity) {
      return {
        success: false,
        error: `Insufficient stock for ${product.name}. Available: ${product.stock}, requested: ${input.quantity}.`,
      };
    }

    const currency = normalizeCurrency(product.metadata);
    const totalAmount = Number(product.price) * input.quantity;
    const order = await this.orderService.createOrder(ctx.userId, {
      merchantId: product.merchantId,
      productId: product.id,
      amount: totalAmount,
      currency,
      assetType: mapAssetType(product.productType),
      metadata: {
        quantity: input.quantity,
        shippingAddress: input.shippingAddress,
        productSnapshot: {
          name: product.name,
          price: Number(product.price),
          category: product.category,
          productType: product.productType,
        },
        orderType: product.productType,
      },
    });

    return {
      success: true,
      data: {
        order: {
          id: order.id,
          status: order.status,
          amount: Number(order.amount),
          currency: order.currency,
          quantity: input.quantity,
        },
        product: {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          currency,
        },
        message: `Created order ${order.id} for ${input.quantity} x ${product.name}.`,
      },
      billingInfo: {
        amount: totalAmount,
        currency,
      },
    };
  }
}