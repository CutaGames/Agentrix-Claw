import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'Session Key 地址（signer）' })
  @IsString()
  signer: string;

  @ApiProperty({
    description: '链上 Session ID（bytes32 hex）',
    required: false,
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiProperty({ description: '单笔限额（USDC，6 decimals）' })
  @IsNumber()
  @Min(100) // 最小 0.0001 USDC (6 decimals)
  singleLimit: number;

  @ApiProperty({ description: '每日限额（USDC，6 decimals）' })
  @IsNumber()
  @Min(1000) // 最小 0.001 USDC (6 decimals)
  dailyLimit: number;

  @ApiProperty({ description: '过期天数' })
  @IsNumber()
  @Min(1)
  @Max(365)
  expiryDays: number;

  @ApiProperty({ description: '用户签名（用于授权）' })
  @IsString()
  signature: string;

  @ApiProperty({ description: 'Agent ID（可选）', required: false })
  @IsString()
  @IsOptional()
  agentId?: string;
}

export class RevokeSessionDto {
  @ApiProperty({ description: 'Session ID' })
  @IsString()
  sessionId: string;
}

