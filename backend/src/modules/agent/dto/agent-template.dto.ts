import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { AgentTemplateVisibility } from '../../../entities/agent-template.entity';

export class CreateAgentTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsOptional()
  persona?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsObject()
  @IsOptional()
  prompts?: Record<string, any>;

  @IsEnum(AgentTemplateVisibility)
  @IsOptional()
  visibility?: AgentTemplateVisibility;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;
}

export class UpdateAgentTemplateDto extends PartialType(CreateAgentTemplateDto) {}

export class InstantiateAgentDto {
  // templateId 从 URL 参数获取，不需要在 body 中验证
  templateId?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  publish?: boolean;
}

