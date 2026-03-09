import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentTermType {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
  BOTH = 'BOTH',
}

export class PaymentTermRuleDto {
  @IsNumber()
  @Min(0)
  days: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent: number;
}

export class CreatePaymentTermDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PaymentTermType)
  type: PaymentTermType;

  @IsNumber()
  @Min(0)
  @Type(() => Number) // Converte a string "0" do front para number
  minAmount: number;

  @IsBoolean()
  isFlexible: boolean;

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  methodIds: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentTermRuleDto)
  rules: PaymentTermRuleDto[];
}
