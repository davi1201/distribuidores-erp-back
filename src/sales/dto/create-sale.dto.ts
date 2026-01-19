import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  sellerId?: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsOptional()
  discount?: number;
}

export class InstallmentPlanDto {
  @IsNumber()
  days: number;

  @IsNumber()
  @IsOptional()
  percent?: number;

  @IsNumber()
  @IsOptional()
  fixedAmount?: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  priceListId: string;

  @IsNumber()
  @IsOptional()
  shipping?: number;

  @IsNumber()
  @IsOptional()
  discount?: number;

  @IsString()
  paymentMethodId: string;

  @IsString()
  @IsOptional()
  paymentTermId?: string; // NOVO: ID da condição de pagamento

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallmentPlanDto)
  @IsOptional()
  installmentsPlan?: InstallmentPlanDto[]; // NOVO: Plano manual se flexível

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
