import { Injectable, Logger } from '@nestjs/common';
import { PayIntentService } from '../payment/pay-intent.service';
import { PaymentService } from '../payment/payment.service';
import { OrderService } from '../order/order.service';
import { ProductService } from '../product/product.service';
import { SearchService } from '../search/search.service';

export interface SandboxExecutionRequest {
  code: string;
  language: 'typescript' | 'javascript' | 'python';
  apiKey?: string;
}

export interface SandboxExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime?: number;
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    private payIntentService: PayIntentService,
    private paymentService: PaymentService,
    private orderService: OrderService,
    private productService: ProductService,
    private searchService: SearchService,
  ) {}

  /**
   * 执行沙箱代码（V3.0：交互式沙盒）
   */
  async executeCode(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const startTime = Date.now();

    try {
      // 解析代码，提取API调用
      const apiCalls = this.parseCode(request.code, request.language);

      const results: any[] = [];

      for (const apiCall of apiCalls) {
        try {
          const result = await this.executeApiCall(apiCall, request.apiKey);
          results.push(result);
        } catch (error: any) {
          results.push({
            error: error.message,
            apiCall,
          });
        }
      }

      return {
        success: true,
        output: results.length === 1 ? results[0] : results,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error('沙箱执行失败:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 解析代码，提取API调用
   */
  private parseCode(code: string, language: string): Array<{
    method: string;
    params: any;
  }> {
    const apiCalls: Array<{ method: string; params: any }> = [];

    // 简单的代码解析（实际应该使用AST解析器）
    // 这里只是示例，实际应该更完善

    // 检测 payments.create
    if (code.includes('payments.create') || code.includes('payments_create')) {
      const amountMatch = code.match(/amount[:\s]*(\d+)/i);
      const currencyMatch = code.match(/currency[:\s]*['"]([^'"]+)['"]/i);
      apiCalls.push({
        method: 'payments.create',
        params: {
          amount: amountMatch ? parseFloat(amountMatch[1]) : 100,
          currency: currencyMatch ? currencyMatch[1] : 'CNY',
        },
      });
    }

    // 检测 orders.create
    if (code.includes('orders.create') || code.includes('orders_create')) {
      const productIdMatch = code.match(/productId[:\s]*['"]([^'"]+)['"]/i);
      apiCalls.push({
        method: 'orders.create',
        params: {
          productId: productIdMatch ? productIdMatch[1] : 'prod_123',
        },
      });
    }

    // 检测 marketplace.searchProducts
    if (code.includes('searchProducts') || code.includes('search_products')) {
      const queryMatch = code.match(/query[:\s]*['"]([^'"]+)['"]/i);
      apiCalls.push({
        method: 'marketplace.searchProducts',
        params: {
          query: queryMatch ? queryMatch[1] : '商品',
        },
      });
    }

    return apiCalls;
  }

  /**
   * 执行API调用（模拟）
   */
  private async executeApiCall(
    apiCall: { method: string; params: any },
    apiKey?: string,
  ): Promise<any> {
    // 模拟API调用（实际应该调用真实的服务，但使用测试数据）
    switch (apiCall.method) {
      case 'payments.create':
        return {
          id: `pay_${Date.now()}`,
          status: 'pending',
          amount: apiCall.params.amount,
          currency: apiCall.params.currency,
          paymentUrl: `https://pay.agentrix.com/pay/pay_${Date.now()}`,
        };

      case 'orders.create':
        return {
          id: `order_${Date.now()}`,
          status: 'created',
          productId: apiCall.params.productId,
          amount: 100,
          currency: 'CNY',
        };

      case 'marketplace.searchProducts':
        return {
          products: [
            {
              id: 'prod_1',
              name: '示例商品',
              price: 100,
              currency: 'CNY',
            },
          ],
          total: 1,
        };

      default:
        return { message: 'API调用模拟成功', method: apiCall.method };
    }
  }
}

