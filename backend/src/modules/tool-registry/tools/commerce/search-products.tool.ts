import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProductService } from '../../../product/product.service';
import { AgentrixTool, ToolContext, ToolResult, ToolCategory } from '../../interfaces';
import { RegisterTool } from '../../decorators/register-tool.decorator';

const inputSchema = z.object({
  query: z.string().describe('Search query for products'),
  category: z.string().optional().describe('Product category filter'),
  limit: z.number().int().min(1).max(20).default(5).describe('Maximum results to return'),
  maxResults: z.number().int().min(1).max(20).optional().describe('Legacy alias for limit'),
});

type Input = z.infer<typeof inputSchema>;

function normalizeCurrency(metadata: Record<string, any> | null | undefined): string {
  return metadata?.currency
    || metadata?.extensions?.currency
    || metadata?.core?.price?.currency
    || 'CNY';
}

@RegisterTool()
@Injectable()
export class SearchProductsTool implements AgentrixTool<Input> {
  readonly name = 'search_products';
  readonly category = ToolCategory.COMMERCE;
  readonly description = 'Search for products on the Agentrix marketplace. Returns product names, prices, and descriptions.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = true;
  readonly isConcurrencySafe = true;
  readonly requiresPayment = false;
  readonly riskLevel = 0 as const;
  readonly maxResultChars = 4000;

  constructor(
    private readonly productService: ProductService,
  ) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const limit = input.maxResults ?? input.limit ?? 5;
    const products = await this.productService.getProducts(input.query);
    const filtered = products
      .filter((product) => !input.category || product.category === input.category)
      .slice(0, limit)
      .map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        productType: product.productType,
        price: Number(product.price),
        currency: normalizeCurrency(product.metadata),
        stock: product.stock,
      }));

    return {
      success: true,
      data: {
        query: input.query,
        total: filtered.length,
        products: filtered,
        message: filtered.length > 0
          ? `Found ${filtered.length} product${filtered.length === 1 ? '' : 's'} for "${input.query}".`
          : `No products found for "${input.query}".`,
      },
    };
  }

  prompt(): string {
    return 'Use this tool to search the Agentrix marketplace for products, skills, and services.';
  }
}
