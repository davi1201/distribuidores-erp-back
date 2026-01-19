import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentTermRuleDto {
  @IsNumber()
  days: number; // 0 = Entrada/À vista, 30 = 30 dias, etc.

  @IsNumber()
  percent: number; // Porcentagem do total (0 a 100)
}

export enum PaymentTermType {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
  BOTH = 'BOTH',
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentTermRuleDto)
  rules: PaymentTermRuleDto[];

  @IsBoolean()
  isFlexible: boolean;
}
