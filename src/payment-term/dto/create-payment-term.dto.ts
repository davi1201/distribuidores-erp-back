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
  @Type(() => Number)
  minAmount: number;

  @IsBoolean()
  isFlexible: boolean;

  // --- Desconto por Pontualidade ---
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  discountPercentage?: number; // Ex: 5% de desconto

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  discountDays?: number; // Dias para o desconto ser válido (ex: 10 dias antes do vencimento)

  // --- Juros e Multa por Atraso ---
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  interestPercentage?: number; // Juros ao mês (ex: 1%)

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  finePercentage?: number; // Multa fixa por atraso (ex: 2%)

  @IsString()
  @IsOptional()
  instructions?: string; // Observações para boleto/fatura

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  methodIds: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentTermRuleDto)
  rules: PaymentTermRuleDto[];
}
