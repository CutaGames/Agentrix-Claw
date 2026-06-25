import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional, IsDateString } from 'class-validator';

export class GenerateCodesDto {
  @IsString()
  @IsNotEmpty()
  batch: string;

  @IsInt()
  @Min(1)
  @Max(5000)
  count: number;

  @IsString()
  @IsOptional()
  channel?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  maxUses?: number;
}
