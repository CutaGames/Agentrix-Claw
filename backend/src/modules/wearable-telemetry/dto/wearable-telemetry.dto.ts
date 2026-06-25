import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TelemetryChannel {
  HEART_RATE = 'heart_rate',
  SPO2 = 'spo2',
  TEMPERATURE = 'temperature',
  STEPS = 'steps',
  BATTERY = 'battery',
  ACCELEROMETER = 'accelerometer',
  CUSTOM = 'custom',
}

export enum TriggerCondition {
  GT = 'gt',
  LT = 'lt',
  GTE = 'gte',
  LTE = 'lte',
  EQ = 'eq',
  BETWEEN = 'between',
  CHANGE = 'change',
  ABSENT = 'absent',
}

export enum TriggerAction {
  NOTIFY_AGENT = 'notify_agent',
  LOG_EVENT = 'log_event',
  SEND_ALERT = 'send_alert',
  EXECUTE_SKILL = 'execute_skill',
  UPDATE_CONTEXT = 'update_context',
}

export class TelemetrySampleDto {
  @ApiProperty() @IsString() @IsNotEmpty() deviceId: string;
  @ApiProperty({ enum: TelemetryChannel }) @IsEnum(TelemetryChannel) channel: TelemetryChannel;
  @ApiProperty() @IsNumber() value: number;
  @ApiProperty() @IsString() unit: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rawBase64?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() characteristicUuid?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceUuid?: string;
  @ApiProperty() @IsString() timestamp: string;
}

export class UploadTelemetryDto {
  @ApiProperty() @IsString() @IsNotEmpty() deviceId: string;
  @ApiProperty() @IsString() @IsNotEmpty() deviceName: string;
  @ApiProperty({ type: [TelemetrySampleDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TelemetrySampleDto)
  samples: TelemetrySampleDto[];
}

export class RegisterWearableVerificationDto {
  @ApiProperty({ example: 'wearable.phase1_verified' }) @IsString() @IsNotEmpty() type: 'wearable.phase1_verified';
  @ApiPropertyOptional({ example: 'wearable' }) @IsOptional() @IsString() source?: string;
  @ApiProperty() @IsString() @IsNotEmpty() deviceId: string;
  @ApiProperty() @IsString() @IsNotEmpty() deviceName: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) services: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() firstReadableCharacteristicUuid?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payloadPreview?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supportTier?: string;
}

export class CreateAutomationRuleDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() deviceId: string;
  @ApiProperty({ enum: TelemetryChannel }) @IsEnum(TelemetryChannel) channel: TelemetryChannel;
  @ApiProperty({ enum: TriggerCondition }) @IsEnum(TriggerCondition) condition: TriggerCondition;
  @ApiProperty() @IsNumber() threshold: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() thresholdHigh?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() windowMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cooldownMs?: number;
  @ApiProperty({ enum: TriggerAction }) @IsEnum(TriggerAction) action: TriggerAction;
  @ApiPropertyOptional() @IsOptional() @IsObject() actionPayload?: Record<string, unknown>;
}

export class UpdateAutomationRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TriggerCondition) condition?: TriggerCondition;
  @ApiPropertyOptional() @IsOptional() @IsNumber() threshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() thresholdHigh?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() windowMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cooldownMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TriggerAction) action?: TriggerAction;
  @ApiPropertyOptional() @IsOptional() @IsObject() actionPayload?: Record<string, unknown>;
}

export class QueryTelemetryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() deviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TelemetryChannel) channel?: TelemetryChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Max(1000) limit?: number;
}
