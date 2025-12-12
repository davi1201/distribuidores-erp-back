import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductImageDto {
  @IsString()
  url: string;

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class ProductPriceDto {
  @IsString()
  priceListId: string;

  @IsNumber()
  price: number;
}

export class ProductStockDto {
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @IsOptional()
  minStock?: number;

  @IsNumber()
  @IsOptional()
  maxStock?: number;

  @IsString()
  @IsOptional()
  warehouseId?: string;
}

export class ProductSupplierDto {
  @IsString()
  supplierId: string;

  @IsString()
  @IsOptional()
  supplierProductCode?: string;

  @IsNumber()
  @IsOptional()
  lastPrice?: number;
}

// DTO para criar produto simples
export class CreateProductDto {
  @IsString()
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

  @IsString()
  @IsOptional()
  parentId?: string;

  @IsString()
  @IsOptional()
  variantName?: string;

  @IsString()
  ncm: string;

  @IsString()
  @IsOptional()
  cest?: string;

  @IsString()
  @IsOptional()
  cfop?: string;

  @IsNumber()
  @IsOptional()
  origin?: number;

  @IsString()
  @IsOptional()
  taxProfileId?: string;

  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  expenses?: number;

  @IsNumber()
  @IsOptional()
  markup?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  @IsOptional()
  prices?: ProductPriceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  @IsOptional()
  images?: ProductImageDto[];

  @ValidateNested()
  @Type(() => ProductStockDto)
  @IsOptional()
  stock?: ProductStockDto;

  @ValidateNested()
  @Type(() => ProductSupplierDto)
  @IsOptional()
  supplier?: ProductSupplierDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// DTO para dados do produto PAI
export class ParentProductDataDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  ncm: string;

  @IsString()
  @IsOptional()
  cest?: string;

  @IsString()
  @IsOptional()
  cfop?: string;

  @IsNumber()
  @IsOptional()
  origin?: number;

  @IsString()
  @IsOptional()
  taxProfileId?: string;
}

// DTO para cada variante
export class ProductVariantDto {
  @IsString()
  name: string; // Ex: "400ml", "Azul", etc

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  ncm?: string;

  @IsString()
  @IsOptional()
  cest?: string;

  @IsString()
  @IsOptional()
  cfop?: string;

  @IsNumber()
  @IsOptional()
  origin?: number;

  @IsString()
  @IsOptional()
  taxProfileId?: string;

  @IsNumber()
  costPrice: number;

  @IsNumber()
  @IsOptional()
  expenses?: number;

  @IsNumber()
  @IsOptional()
  markup?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  @IsOptional()
  prices?: ProductPriceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  @IsOptional()
  images?: ProductImageDto[];

  @ValidateNested()
  @Type(() => ProductStockDto)
  @IsOptional()
  stock?: ProductStockDto;

  @ValidateNested()
  @Type(() => ProductSupplierDto)
  @IsOptional()
  supplier?: ProductSupplierDto;
}

// DTO para criar produtos em lote (com variantes)
export class CreateProductBatchDto {
  @ValidateNested()
  @Type(() => ParentProductDataDto)
  @IsOptional()
  parentData?: ParentProductDataDto; // null se for produto simples

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants: ProductVariantDto[]; // Array com 1 item = produto simples; 2+ = grade
}
