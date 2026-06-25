import { IsNumber, IsString, IsOptional, IsEnum } from 'class-validator';
import { PaymentMethod } from '../../../entities/payment.entity';

export class EstimateFeeDto {
  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsString()
  @IsOptional()
  chain?: string;

  @IsString()
  @IsOptional()
  targetCurrency?: string;
}

export class ComparePaymentCostsDto {
  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsString()
  @IsOptional()
  chain?: string;

  @IsString()
  @IsOptional()
  targetCurrency?: string;
}

