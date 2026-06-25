import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsObject } from 'class-validator';
import { SocialAccountType } from '../../../entities/social-account.entity';

export class RegisterDto {
  @ApiProperty({ description: '邮箱地址' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({ description: '密码', minLength: 6 })
  @IsString()
  @MinLength(6, { message: '密码长度至少6位' })
  password: string;

  @ApiProperty({ description: 'Agentrix ID（可选）', required: false })
  @IsString()
  @IsOptional()
  agentrixId?: string;
}

export class LoginDto {
  @ApiProperty({ description: '邮箱地址' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  password: string;
}

export class WalletLoginDto {
  @ApiProperty({ description: '钱包地址' })
  @IsString()
  walletAddress: string;

  @ApiProperty({ description: '钱包类型', enum: ['metamask', 'walletconnect', 'phantom', 'okx'] })
  @IsString()
  walletType: string;

  @ApiProperty({ description: '链类型', enum: ['evm', 'solana'] })
  @IsString()
  chain: string;

  @ApiProperty({ description: '签名消息' })
  @IsString()
  message: string;

  @ApiProperty({ description: '签名' })
  @IsString()
  signature: string;

  @ApiProperty({ description: '链ID（可选）', required: false })
  @IsString()
  @IsOptional()
  chainId?: string;
}

export class SocialTokenLoginDto {
  @ApiProperty({ description: '社交账号类型', enum: SocialAccountType })
  @IsEnum(SocialAccountType, { message: '无效的社交账号类型' })
  provider: SocialAccountType;

  @ApiProperty({ description: '来自社交平台的 OAuth access token 或 id token' })
  @IsString()
  accessToken: string;

  @ApiProperty({ description: '社交平台用户ID（可选，部分平台需要）', required: false })
  @IsOptional()
  @IsString()
  socialId?: string;

  @ApiProperty({ description: '用户邮箱（可选，部分平台返回）', required: false })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string;

  @ApiProperty({ description: '用户名（可选）', required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ description: '显示名称（可选）', required: false })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ description: '头像URL（可选）', required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class BindSocialAccountDto {
  @ApiProperty({ description: '社交账号类型', enum: SocialAccountType })
  @IsEnum(SocialAccountType, { message: '无效的社交账号类型' })
  type: SocialAccountType;

  @ApiProperty({ description: '第三方平台用户ID' })
  @IsString()
  socialId: string;

  @ApiProperty({ description: '邮箱（可选）', required: false })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string;

  @ApiProperty({ description: '用户名（可选）', required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ description: '显示名称（可选）', required: false })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ description: '头像地址（可选）', required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ description: '附加元数据（可选）', required: false, type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}


