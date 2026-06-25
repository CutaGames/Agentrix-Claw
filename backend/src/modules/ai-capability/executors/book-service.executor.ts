import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';

@Injectable()
export class BookServiceExecutor implements ICapabilityExecutor {
  name = 'executor_book';
  private readonly logger = new Logger(BookServiceExecutor.name);

  constructor(
    private productService: ProductService,
    private orderService: OrderService,
  ) {}

  async execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const { product_id, appointment_time, contact_info } = params;
      const { userId } = context;

      if (!userId) {
        return {
          success: false,
          error: 'USER_NOT_AUTHENTICATED',
          message: '用户未认证，请先登录',
        };
      }

      if (!product_id) {
        return {
          success: false,
          error: 'MISSING_PRODUCT_ID',
          message: '缺少服务ID参数',
        };
      }

      if (!appointment_time) {
        return {
          success: false,
          error: 'MISSING_APPOINTMENT_TIME',
          message: '缺少预约时间参数',
        };
      }

      // 1. 获取服务信息
      const product = await this.productService.getProduct(product_id);
      if (!product) {
        return {
          success: false,
          error: 'SERVICE_NOT_FOUND',
          message: `服务不存在：${product_id}`,
        };
      }

      // 2. 验证预约时间格式
      const appointmentDate = new Date(appointment_time);
      if (isNaN(appointmentDate.getTime())) {
        return {
          success: false,
          error: 'INVALID_APPOINTMENT_TIME',
          message: '预约时间格式无效，请使用 ISO 8601 格式',
        };
      }

      // 3. 计算价格
      const totalAmount = Number(product.price);
      const currency = (product.metadata as any)?.currency || 'CNY';

      // 4. 创建订单（服务预约订单）
      const order = await this.orderService.createOrder(userId, {
        merchantId: product.merchantId,
        productId: product.id,
        amount: totalAmount,
        currency,
        metadata: {
          appointmentTime: appointment_time,
          contactInfo: contact_info,
          serviceType: 'booking',
          productSnapshot: {
            name: product.name,
            price: product.price,
            category: product.category,
          },
          source: 'ai_capability',
        },
      });

      return {
        success: true,
        data: {
          orderId: order.id,
          serviceName: product.name,
          appointmentTime: appointment_time,
          totalAmount,
          currency,
          status: 'booking_created',
        },
        message: `服务预约成功！订单号：${order.id}，预约时间：${appointment_time}`,
        orderId: order.id,
      };
    } catch (error: any) {
      this.logger.error(`BookService execution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: `执行失败：${error.message}`,
      };
    }
  }
}


