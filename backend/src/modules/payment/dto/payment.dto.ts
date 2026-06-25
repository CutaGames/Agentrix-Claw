import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { PaymentMethod } from '../../../entities/payment.entity';

export class CreatePaymentIntentDto {
  @ApiProperty({ description: '支付金额' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: '货币类型', default: 'CNY' })
  @IsString()
  @IsOptional()
  currency: string = 'CNY';

  @ApiProperty({ enum: PaymentMethod, description: '支付方式' })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;

  @ApiProperty({ description: '用户ID' })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ description: '支付ID（用于Webhook回调）', required: false })
  @IsString()
  @IsOptional()
  paymentId?: string;

  @ApiProperty({ description: '支付描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '元数据', required: false })
  @IsOptional()
  metadata?: any;
}

export class ProcessPaymentDto {
  @ApiProperty({ description: '支付金额' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: '货币类型', default: 'CNY' })
  @IsString()
  @IsOptional()
  currency: string = 'CNY';

  @ApiProperty({ enum: PaymentMethod, description: '支付方式' })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;

  @ApiProperty({ description: '支付意图ID（Stripe）', required: false })
  @IsString()
  @IsOptional()
  paymentIntentId?: string;

  @ApiProperty({ description: '支付描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '商户ID', required: false })
  @IsString()
  @IsOptional()
  merchantId?: string;

  @ApiProperty({ description: 'Agent ID', required: false })
  @IsString()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: '元数据', required: false })
  @IsOptional()
  metadata?: any;
}

export class CreateProviderPaymentSessionDto {
  @ApiProperty({ description: '法币支付金额' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: '法币货币，例如 CNY/USD', default: 'CNY' })
  @IsString()
  @IsOptional()
  currency: string = 'CNY';

  @ApiProperty({ description: '目标数字货币', default: 'USDC' })
  @IsString()
  toCurrency: string;

  @ApiProperty({ description: 'Provider ID，如 moonpay/alchemy/binance' })
  @IsString()
  providerId: string;

  @ApiProperty({ description: '用户选择的支付方式', example: 'apple_pay' })
  @IsString()
  paymentRail: string;

  @ApiProperty({ description: '智能路由推荐ID（可选）', required: false })
  @IsString()
  @IsOptional()
  routeId?: string;

  @ApiProperty({ description: 'Provider报价信息', required: false })
  @IsOptional()
  quote?: any;

  @ApiProperty({ description: '锁定ID（如果已锁定汇率）', required: false })
  @IsString()
  @IsOptional()
  lockId?: string;

  @ApiProperty({ description: '商户ID', required: false })
  @IsString()
  @IsOptional()
  merchantId?: string;

  @ApiProperty({ description: '订单描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '额外元数据', required: false })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Stripe 支付创建 DTO (公开端点，userId 可选)
 */
export class CreateStripePaymentPublicDto {
  @ApiProperty({ description: '支付金额' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: '货币类型', default: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @ApiProperty({ description: '用户ID (可选)', required: false })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ description: '订单ID（可选）', required: false })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiProperty({ description: '商户ID（可选）', required: false })
  @IsString()
  @IsOptional()
  merchantId?: string;

  @ApiProperty({ description: 'Agent ID（可选）', required: false })
  @IsString()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: '支付描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    description: '技能层类型（用于分佣计算）', 
    enum: ['INFRA', 'RESOURCE', 'LOGIC', 'COMPOSITE'],
    required: false 
  })
  @IsString()
  @IsOptional()
  skillLayerType?: 'INFRA' | 'RESOURCE' | 'LOGIC' | 'COMPOSITE';

  @ApiProperty({ description: '自定义分佣率（0-1）', required: false })
  @IsNumber()
  @IsOptional()
  commissionRate?: number;

  @ApiProperty({ description: 'Stripe Customer ID（可选）', required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ description: '额外元数据', required: false })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Stripe 支付创建 DTO (需要认证)
 */
export class CreateStripePaymentDto {
  @ApiProperty({ description: '支付金额' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: '货币类型', default: 'USD' })
  @IsString()
  @IsOptional()
  currency: string = 'USD';

  @ApiProperty({ description: '用户ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: '订单ID（可选）', required: false })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiProperty({ description: '商户ID（可选）', required: false })
  @IsString()
  @IsOptional()
  merchantId?: string;

  @ApiProperty({ description: 'Agent ID（可选）', required: false })
  @IsString()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: '支付描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    description: '技能层类型（用于分佣计算）', 
    enum: ['INFRA', 'RESOURCE', 'LOGIC', 'COMPOSITE'],
    required: false 
  })
  @IsString()
  @IsOptional()
  skillLayerType?: 'INFRA' | 'RESOURCE' | 'LOGIC' | 'COMPOSITE';

  @ApiProperty({ description: '自定义分佣率（0-1）', required: false })
  @IsNumber()
  @IsOptional()
  commissionRate?: number;

  @ApiProperty({ description: 'Stripe Customer ID（可选）', required: false })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ description: '额外元数据', required: false })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Stripe 退款 DTO
 */
export class CreateStripeRefundDto {
  @ApiProperty({ description: 'Stripe PaymentIntent ID' })
  @IsString()
  @IsNotEmpty()
  paymentIntentId: string;

  @ApiProperty({ description: '退款金额（可选，不提供则全额退款）', required: false })
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiProperty({ 
    description: '退款原因', 
    enum: ['duplicate', 'fraudulent', 'requested_by_customer'],
    required: false 
  })
  @IsString()
  @IsOptional()
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

/**
 * Stripe Customer 创建/获取 DTO
 */
export class StripeCustomerDto {
  @ApiProperty({ description: '用户ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: '用户邮箱', required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: '用户名称', required: false })
  @IsString()
  @IsOptional()
  name?: string;
}

/**
 * Stripe 费率计算请求 DTO
 */
export class CalculateStripeFeeDto {
  @ApiProperty({ description: '支付金额' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: '是否为国际卡支付', default: false })
  @IsOptional()
  isInternational?: boolean;
}

