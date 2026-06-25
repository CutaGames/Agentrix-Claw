import { IsString, IsOptional, IsEmail } from 'class-validator';
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

