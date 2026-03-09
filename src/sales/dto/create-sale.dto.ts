import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// --- DTO PARA OS ITENS DO PEDIDO ---
export class OrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice: number; // Adicionado conforme payload

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  discount?: number;

  @IsString()
  @IsNotEmpty()
  // Ajustado para bater com "READY_DELIVERY" do JSON
  deliveryType: 'READY_DELIVERY' | 'PRE_ORDER';
}

// --- DTO PARA OS PAGAMENTOS (MULTIPAGAMENTO) ---
export class OrderPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  tenantPaymentMethodId: string;

  @IsUUID()
  @IsOptional()
  paymentTermId?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string; // Formato "2026-03-10"
}

// --- DTO PRINCIPAL DE CRIAÇÃO DE PEDIDO ---
export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsUUID()
  @IsNotEmpty()
  priceListId: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  shipping?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  discount?: number;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  totalAmount: number; // Adicionado conforme payload

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  @IsNotEmpty()
  payments: OrderPaymentDto[]; // Substituiu os campos flat anteriores

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsNotEmpty()
  items: OrderItemDto[];
}
