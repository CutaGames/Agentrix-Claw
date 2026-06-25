import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';

export class CreateMPCWalletDto {
  @IsString()
  password: string; // 用于加密分片的密码

  @IsString()
  @IsOptional()
  agentAccountId?: string; // 关联的智能体账户 ID（可选）
}

export class CreateSocialMPCWalletDto {
  @IsString()
  socialProviderId: string; // 社交账号 ID (Google ID, Twitter ID 等)

  @IsString()
  @IsOptional()
  chain?: string; // 链类型，默认 BSC
}

export class RecoverWalletDto {
  @IsString()
  encryptedShardA: string; // 加密的分片 A

  @IsString()
  encryptedShardC: string; // 加密的分片 C

  @IsString()
  password: string; // 解密密码
}

