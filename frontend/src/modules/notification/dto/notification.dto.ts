import { IsString, IsEnum, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../../../entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationType, description: '通知类型' })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: '通知标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '通知内容' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: '操作链接' })
  @IsOptional()
  @IsUrl()
  actionUrl?: string;

  @ApiPropertyOptional({ description: '元数据（JSON对象）' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class MarkAsReadDto {
  @ApiProperty({ description: '通知ID' })
  @IsString()
  id: string;
}

