import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty, Min, Max } from 'class-validator';

export class CreateGrantDto {
  @ApiProperty({ description: 'Agent ID' })
  @IsString()
  @IsNotEmpty()
  agentId: string;

  @ApiProperty({ description: '单次限额（元）' })
  @IsNumber()
  @Min(1)
  @Max(1000)
  singleLimit: number;

  @ApiProperty({ description: '每日限额（元）' })
  @IsNumber()
  @Min(10)
  @Max(5000)
  dailyLimit: number;

  @ApiProperty({ description: '授权时长（天）' })
  @IsNumber()
  @Min(1)
  @Max(180)
  duration: number;
}

export class UpdateGrantDto {
  @ApiProperty({ description: '单次限额（元）', required: false })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(1000)
  singleLimit?: number;

  @ApiProperty({ description: '每日限额（元）', required: false })
  @IsNumber()
  @IsOptional()
  @Min(10)
  @Max(5000)
  dailyLimit?: number;
}

