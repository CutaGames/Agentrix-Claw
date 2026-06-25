import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ValidateCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 12)
  code: string;
}

export class RedeemCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 12)
  code: string;
}
