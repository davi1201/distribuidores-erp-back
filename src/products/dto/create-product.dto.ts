import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// DTO para Imagens
export class CreateProductImageDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsInt()
  @IsOptional()
  order?: number;
}

// DTO para Preços (por Lista de Preço)
export class CreateProductPriceDto {
  @IsString()
  @IsNotEmpty()
  priceListId: string;

  @IsNumber()
  @Min(0)
  price: number;
}

// DTO para Estoque Inicial
export class CreateStockItemDto {
  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  minStock: number;

  @IsNumber()
  @IsOptional()
  maxStock?: number;

  @IsString()
  @IsOptional()
  warehouseId?: string;
}

export class CreateProductDto {
  // --- Identificação ---
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  ean?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  // --- Variação (Opcional) ---
  @IsString()
  @IsOptional()
  parentId?: string;

  @IsString()
  @IsOptional()
  variantName?: string;

  // --- Fiscal (Obrigatório para ERP) ---
  @IsString()
  @IsNotEmpty()
  ncm: string;

  @IsString()
  @IsOptional()
  cest?: string;

  @IsString()
  @IsOptional()
  cfop?: string;

  @IsInt()
  @IsOptional()
  origin?: number;

  @IsString()
  @IsOptional()
  taxProfileId?: string;

  // --- Custos Base ---
  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsNumber()
  @Min(0)
  expenses: number;

  @IsNumber()
  @Min(0)
  markup: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // --- Relacionamentos Aninhados ---

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  @IsOptional()
  images?: CreateProductImageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductPriceDto)
  @IsOptional()
  prices?: CreateProductPriceDto[];

  @ValidateNested()
  @Type(() => CreateStockItemDto)
  @IsOptional()
  stock?: CreateStockItemDto;
}
