import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray, IsObject, IsUUID, IsNumber, Min, Max } from 'class-validator';
import { DelegationLevel, UserAgentStatus } from '../../../entities/user-agent.entity';

export class CreateAgentDto {
  @ApiProperty({ description: 'Agent name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Agent description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Agent personality description' })
  @IsOptional()
  @IsString()
  personality?: string;

  @ApiPropertyOptional({ description: 'Custom system prompt' })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({ description: 'Agent avatar URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'Default AI model' })
  @IsOptional()
  @IsString()
  defaultModel?: string;

  @ApiPropertyOptional({ description: 'Enabled capabilities', type: [String] })
  @IsOptional()
  @IsArray()
  capabilities?: string[];

  @ApiPropertyOptional({ description: 'Delegation level', enum: DelegationLevel })
  @IsOptional()
  @IsEnum(DelegationLevel)
  delegationLevel?: DelegationLevel;

  @ApiPropertyOptional({ description: 'Template ID to create from' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ description: 'Additional agent settings' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Additional agent metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultModel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  capabilities?: string[];

  @ApiPropertyOptional({ enum: DelegationLevel })
  @IsOptional()
  @IsEnum(DelegationLevel)
  delegationLevel?: DelegationLevel;

  @ApiPropertyOptional({ enum: UserAgentStatus })
  @IsOptional()
  @IsEnum(UserAgentStatus)
  status?: UserAgentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  memoryConfig?: {
    scope: 'private' | 'user_shared';
    retentionDays?: number;
    maxEntries?: number;
    autoPromote: boolean;
  };
}

export class BindChannelDto {
  @ApiProperty({ description: 'Platform name', example: 'telegram' })
  @IsString()
  platform: string;

  @ApiProperty({ description: 'Channel ID on the platform' })
  @IsString()
  channelId: string;

  @ApiPropertyOptional({ description: 'Display name for the channel' })
  @IsOptional()
  @IsString()
  channelName?: string;

  @ApiPropertyOptional({ description: 'Channel-specific config' })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class CreateConversationEventDto {
  @ApiProperty()
  @IsUUID()
  agentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiProperty({ description: 'Source channel', example: 'mobile' })
  @IsString()
  channel: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channelMessageId?: string;

  @ApiProperty({ enum: ['inbound', 'outbound', 'system'] })
  @IsString()
  direction: string;

  @ApiProperty({ enum: ['user', 'agent', 'system', 'external_user'] })
  @IsString()
  role: string;

  @ApiPropertyOptional({ default: 'text' })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalSenderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalSenderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, any>;
}

export class CreateSharePolicyDto {
  @ApiProperty()
  @IsUUID()
  sourceAgentId: string;

  @ApiProperty()
  @IsUUID()
  targetAgentId: string;

  @ApiProperty({ enum: ['memory', 'knowledge', 'skills', 'contacts', 'context'] })
  @IsString()
  shareType: string;

  @ApiProperty({ enum: ['full', 'summary_only', 'on_demand', 'blocked'] })
  @IsString()
  shareMode: string;
}

export class TimelineQueryDto {
  @ApiPropertyOptional({ description: 'Filter by channel' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: 'Number of items to return', default: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor for pagination (createdAt ISO)' })
  @IsOptional()
  @IsString()
  before?: string;
}
