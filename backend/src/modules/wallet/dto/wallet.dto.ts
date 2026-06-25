import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { WalletType, ChainType } from '../../../entities/wallet-connection.entity';

export class ConnectWalletDto {
  @ApiProperty({ enum: WalletType, description: '钱包类型' })
  @IsEnum(WalletType)
  @IsNotEmpty()
  walletType: WalletType;

  @ApiProperty({ description: '钱包地址' })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiProperty({ enum: ChainType, description: '链类型' })
  @IsEnum(ChainType)
  @IsNotEmpty()
  chain: ChainType;

  @ApiProperty({ description: '链ID', required: false })
  @IsString()
  @IsOptional()
  chainId?: string;
}

export class VerifySignatureDto {
  @ApiProperty({ description: '钱包ID' })
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @ApiProperty({ description: '签名消息' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ description: '签名' })
  @IsString()
  @IsNotEmpty()
  signature: string;
}

