import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class QuickPayRequestDto {
  @ApiProperty({ description: 'Session ID (bytes32 hex string)' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ description: 'Payment ID' })
  @IsString()
  @IsNotEmpty()
  paymentId: string;

  @ApiProperty({ description: '收款地址' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ description: '支付金额（USDC，6 decimals，字符串格式）' })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({ description: 'Session Key 签名' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: 'Nonce（防重放）' })
  @IsNumber()
  @IsNotEmpty()
  nonce: number;
}

