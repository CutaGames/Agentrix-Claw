import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class X402Guard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const paymentSignature = request.headers['payment-signature'];

    // 如果请求头中没有支付签名，则返回 402 Payment Required
    if (!paymentSignature) {
      throw new HttpException({
        statusCode: 402,
        message: 'Payment Required',
        error: 'Payment Required',
        // V2 标准：返回 WWW-Authenticate 头告知客户端支付参数
        // 这里使用默认值，实际场景中可能需要根据路由元数据动态生成
        headers: {
            'WWW-Authenticate': 'X402 scheme="exact", network="base", token="USDC"',
            'X-Payment-Required': 'true'
        }
      }, HttpStatus.PAYMENT_REQUIRED);
    }

    // 如果存在签名，后续逻辑（如拦截器或控制器）将负责验证签名的有效性
    // 或者在这里调用 FacilitatorService 进行验证
    return true;
  }
}
