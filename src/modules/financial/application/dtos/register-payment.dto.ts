import {
  IsString,
  IsNumber,
  IsPositive,
  IsOptional,
  IsDateString,
  IsUUID,
  Min,
} from 'class-validator';

export class RegisterPaymentDto {
  @IsUUID()
  titleId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  interestAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fineAmount?: number;
}
