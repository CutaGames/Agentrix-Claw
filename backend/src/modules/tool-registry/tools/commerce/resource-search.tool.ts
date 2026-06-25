import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProductService } from '../../../product/product.service';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../interfaces';
import { RegisterTool } from '../../decorators/register-tool.decorator';

const inputSchema = z.object({
  query: z.string().describe('Search query for marketplace resources, services, and APIs'),
  category: z.string().optional().describe('Optional category filter'),
  resourceType: z.string().optional().describe('Optional resource type filter'),
  limit: z.number().int().min(1).max(20).default(5).describe('Maximum results to return'),
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
export class ResourceSearchTool implements AgentrixTool<Input> {
  readonly name = 'resource_search';
  readonly category = ToolCategory.COMMERCE;
  readonly description = 'Search marketplace resources such as services, APIs, datasets, and products.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = true;
  readonly isConcurrencySafe = true;
  readonly requiresPayment = false;
  readonly riskLevel = 0 as const;
  readonly maxResultChars = 4000;

  constructor(private readonly productService: ProductService) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const products = await this.productService.getProducts(input.query);
    const normalizedType = input.resourceType?.toLowerCase();
    const filtered = products
      .filter((product) => {
        if (input.category && product.category !== input.category) {
          return false;
        }

        if (!normalizedType) {
          return true;
        }

        const productType = String(product.productType || '').toLowerCase();
        const category = String(product.category || '').toLowerCase();
        const metadataType = String(product.metadata?.resourceType || product.metadata?.type || '').toLowerCase();
        return productType === normalizedType || category === normalizedType || metadataType === normalizedType;
      })
      .slice(0, input.limit)
      .map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        resourceType: product.metadata?.resourceType || product.productType,
        price: Number(product.price),
        currency: normalizeCurrency(product.metadata),
      }));

    return {
      success: true,
      data: {
        query: input.query,
        total: filtered.length,
        products: filtered,
        message: filtered.length > 0
          ? `Found ${filtered.length} resource${filtered.length === 1 ? '' : 's'} for "${input.query}".`
          : `No resources found for "${input.query}".`,
      },
    };
  }
}