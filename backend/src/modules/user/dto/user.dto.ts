import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '用户邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '用户昵称' })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({ description: '用户简介' })
  @IsOptional()
  @IsString()
  bio?: string;
}

export class UploadAvatarDto {
  @ApiProperty({ type: 'string', format: 'binary', description: '头像文件' })
  file: Express.Multer.File;
}

// 佣金结算方式
export enum PayoutMethod {
  STRIPE_CONNECT = 'stripe_connect',
  CRYPTO_WALLET = 'crypto_wallet',
  NONE = 'none',
}

// Crypto 钱包链类型
export enum CryptoWalletChain {
  EVM = 'evm',
  SOLANA = 'solana',
  BASE = 'base',
}

export class UpdatePayoutSettingsDto {
  @ApiPropertyOptional({ 
    description: '首选结算方式',
    enum: PayoutMethod,
  })
  @IsOptional()
  @IsEnum(PayoutMethod)
  preferredMethod?: PayoutMethod;

  @ApiPropertyOptional({ description: '加密货币钱包地址' })
  @IsOptional()
  @IsString()
  cryptoWalletAddress?: string;

  @ApiPropertyOptional({ 
    description: '加密货币钱包链类型',
    enum: CryptoWalletChain,
  })
  @IsOptional()
  @IsEnum(CryptoWalletChain)
  cryptoWalletChain?: CryptoWalletChain;

  @ApiPropertyOptional({ description: '最低结算金额', minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  minPayoutThreshold?: number;

  @ApiPropertyOptional({ description: '是否启用自动结算' })
  @IsOptional()
  @IsBoolean()
  autoPayoutEnabled?: boolean;
}

